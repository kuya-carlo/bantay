import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import axios from "axios";
// @ts-ignore
import { buildGraph, ScannerService } from "@bantay/core";
// @ts-ignore
import { NotificationService, ConfigService } from "@bantay/core";
import { loadSecrets } from "../../../core/src/services/secrets";
import { formatAssessment, formatFindings, formatInterrupt } from "../formatters";
import chalk from "chalk";

/**
 * Executes the bantay scan command
 */
export async function scanCommand(options: { ci?: boolean; staged?: boolean } = {}) {
  const { ci, staged } = options;
  // 0. Login Check
  try {
    const secrets = await loadSecrets();
    if (!process.env.BANTAY_AUTH0_CLIENT_SECRET && !secrets.BANTAY_AUTH0_CLIENT_SECRET) {
      throw new Error();
    }
  } catch (e) {
    if (!process.env.BANTAY_AUTH0_CLIENT_SECRET) {
      console.error(chalk.red("❌ Not logged in. Run 'bantay login' first."));
      process.exit(1);
    }
  }

  if (process.env.BANTAY_FORCE === "1") {
    console.log(
      chalk.yellow("⚠️  Bantay: Force bypass detected (BANTAY_FORCE=1). Skipping security scan.")
    );
    process.exit(0);
  }

  const configService = new ConfigService();
  const config = await configService.load(process.cwd());

  const scannerService = new (ScannerService as any)(config);
  const notificationService = new NotificationService();

  // 1. Get staged changes and remote metadata
  let diff = "";
  let remoteUrl = "";
  try {
    if (staged) {
      diff = execSync("git diff --cached").toString();
    } else if (ci) {
      try {
        const base = execSync("git merge-base origin/main HEAD").toString().trim();
        diff = execSync(`git diff ${base}..HEAD`).toString();
      } catch (e) {
        // Fallback for CI if origin/main doesn't exist
        diff = execSync("git diff HEAD~1..HEAD").toString();
      }
    } else {
      // Default: pre-push hook (compare HEAD with previous commit)
      try {
        diff = execSync("git diff HEAD~1..HEAD").toString();
      } catch (e) {
        // Fallback if it's the first commit in the repo
        diff = execSync("git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904..HEAD").toString();
      }
    }

    if (!diff) {
      console.log(chalk.green("✅ No changes to scan."));
      return;
    }

    // Get remote URL for metadata
    try {
      remoteUrl = execSync("git remote get-url origin").toString().trim();
    } catch (e) {
      console.warn(chalk.yellow("⚠️  Could not determine git remote URL. Defaulting to public."));
    }

    // Get remote metadata (visibility)
    const metadata = await scannerService.getRepoMetadata(remoteUrl);
    var repoVisibility = metadata.repoVisibility;
  } catch (e) {
    console.error(chalk.red("Failed to get git diff or metadata. Are you in a git repository?"));
    process.exit(1);
  }

  // 2. Initialize and run graph
  console.log(chalk.blue("🛡️  Bantay: Scanning changes..."));
  const graph = await (buildGraph as any)(config);

  try {
    const result = await graph.invoke({
      diff,
      repoMetadata: { repoVisibility },
      approved: null,
    } as any);

    // Check for findings and assessment
    if (result.findings && result.findings.length > 0) {
      console.log(formatFindings(result.findings));
    }

    if (result.riskAssessment) {
      console.log(formatAssessment(result.riskAssessment));
    }

    // 3. Handle Decision
    if (result.approved === true) {
      console.log(chalk.green("✅ Push allowed by policy."));
      process.exit(0);
    } else if (result.approved === false) {
      console.log(chalk.red("❌ Push blocked by security policy. Remove secrets before pushing."));
      process.exit(1);
    } else {
      // MEDIUM risk: Graph is interrupted
      console.log(formatInterrupt());

      // Send ntfy notification directly - don't rely on SDK callback
      try {
        await notificationService.sendAlert(
          config.ntfy.topic,
          `🛡️ Bantay detected secrets requiring approval.\n\nFindings: ${result.findings?.map((f: any) => `${f.type} in ${f.file}`).join(", ")}\n\nApprove or deny this push from your ntfy client.`
        );
        console.log(chalk.dim("📱 Notification sent to your device."));
      } catch (e) {
        console.warn(chalk.yellow("⚠️  Could not send ntfy notification."));
      }

      // Direct CIBA polling
      const domain = process.env.BANTAY_AUTH0_DOMAIN || "kuyacarlo.jp.auth0.com";
      const clientId = process.env.BANTAY_AUTH0_CLIENT_ID;
      const secrets = await loadSecrets();
      const clientSecret =
        process.env.BANTAY_AUTH0_CLIENT_SECRET || secrets.BANTAY_AUTH0_CLIENT_SECRET;
      const auth0UserId =
        process.env.BANTAY_AUTH0_USER_ID ||
        (await fs
          .readFile(path.join(os.homedir(), ".bantay", "config"), "utf8")
          .then((c) => JSON.parse(c).auth0UserId)
          .catch(() => null));

      if (!clientId || !clientSecret || !auth0UserId) {
        console.error(chalk.red("❌ Missing credentials for CIBA approval."));
        process.exit(1);
      }

      const loginHint = JSON.stringify({
        format: "iss_sub",
        iss: `https://${domain}/`,
        sub: auth0UserId,
      });

      let authReqId: string;
      try {
        const cibaRes = await axios.post(
          `https://${domain}/bc-authorize`,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            binding_message: `Bantay: ${result.findings?.length} secrets detected. Authorize this push.`,
            login_hint: loginHint,
            scope: "openid",
          }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        authReqId = cibaRes.data.auth_req_id;
        console.log(
          chalk.dim("🔐 Auth0 CIBA initiated. Waiting for approval on your Guardian app...")
        );
      } catch (e: any) {
        console.error(
          chalk.red(
            `❌ CIBA initiation failed: ${e.response?.data?.error_description || e.message}`
          )
        );
        process.exit(1);
      }

      const startTime = Date.now();
      const timeout = ((config as any).scan?.cibaTimeoutSeconds || 60) * 1000;
      const interval = 5000;

      while (Date.now() - startTime < timeout) {
        await new Promise((r) => setTimeout(r, interval));
        try {
          const tokenRes = await axios.post(
            `https://${domain}/oauth/token`,
            new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "urn:openid:params:grant-type:ciba",
              auth_req_id: authReqId,
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );
          if (tokenRes.data.access_token) {
            console.log(chalk.green("✅ Authorization approved. Push allowed."));
            process.exit(0);
          }
        } catch (e: any) {
          const errCode = e.response?.data?.error;
          if (errCode === "authorization_pending") {
            console.log(chalk.dim("⏳ Waiting for Guardian approval..."));
            continue;
          } else if (errCode === "access_denied") {
            console.log(chalk.red("❌ Authorization denied. Push blocked."));
            process.exit(1);
          } else if (errCode === "expired_token") {
            console.log(chalk.red("❌ Authorization request expired. Push blocked."));
            process.exit(1);
          } else {
            console.error(
              chalk.red(
                `❌ CIBA polling error: ${e.response?.data?.error_description || e.message}`
              )
            );
            process.exit(1);
          }
        }
      }

      if ((config as any).scan?.blockOnTimeout) {
        console.log(chalk.red("❌ Authorization timed out. Push blocked."));
        process.exit(1);
      } else {
        console.log(chalk.yellow("⚠️  Authorization timed out. Proceeding anyway (non-blocking)."));
        process.exit(0);
      }
    }
  } catch (error) {
    console.error(
      chalk.red(`\n🚨 Error during scan: ${error instanceof Error ? error.message : String(error)}`)
    );
    // Fail-Closed
    process.exit(1);
  }
}
