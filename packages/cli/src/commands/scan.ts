import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import axios from "axios";
// @ts-ignore
import {
  buildGraph,
  ScannerService,
  NotificationService,
  ConfigService,
  loadSecrets,
} from "@bantay/core";
import { formatAssessment, formatFindings, formatInterrupt } from "../formatters";
import chalk from "chalk";

/**
 * Executes the bantay scan command
 */
export async function scanCommand(
  options: {
    ci?: boolean;
    staged?: boolean;
    prePush?: boolean;
    allFiles?: boolean;
    all?: boolean;
  } = {}
) {
  const { ci, staged, prePush, allFiles, all } = options;
  // 0. Login Check & Secrets Loading
  let secrets: any = {};
  try {
    secrets = await loadSecrets();
    if (!process.env.BANTAY_AUTH0_CLIENT_SECRET && !secrets.BANTAY_AUTH0_CLIENT_SECRET) {
      throw new Error();
    }
    if (secrets.BANTAY_AUTH0_USER_ID && !process.env.BANTAY_AUTH0_USER_ID) {
      process.env.BANTAY_AUTH0_USER_ID = secrets.BANTAY_AUTH0_USER_ID;
    }
    if (secrets.BANTAY_AUTH0_CLIENT_SECRET && !process.env.BANTAY_AUTH0_CLIENT_SECRET) {
      process.env.BANTAY_AUTH0_CLIENT_SECRET = secrets.BANTAY_AUTH0_CLIENT_SECRET;
    }
    if (secrets.BANTAY_LLM_API_KEY && !process.env.VULTR_API_KEY) {
      process.env.VULTR_API_KEY = secrets.BANTAY_LLM_API_KEY;
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
  const notificationService = new NotificationService({
    user: process.env.BANTAY_NTFY_USERNAME || secrets.BANTAY_NTFY_USERNAME,
    pass: process.env.BANTAY_NTFY_PASSWORD || secrets.BANTAY_NTFY_PASSWORD,
    baseURL: process.env.BANTAY_NTFY_URL || (config.ntfy as any)?.url,
  });

  // 1. Get diff to scan
  let diff = "";
  let remoteUrl = "";

  try {
    if (staged) {
      diff = execSync("git diff --cached").toString().trim();
    } else if (ci) {
      try {
        const base = execSync("git merge-base origin/main HEAD", {
          stdio: ["pipe", "pipe", "pipe"],
        })
          .toString()
          .trim();
        diff = execSync(`git diff ${base}..HEAD`).toString().trim();
      } catch (e) {
        diff = execSync("git diff HEAD~1..HEAD").toString().trim();
      }
    } else if (prePush) {
      // Non-blocking stdin read for pre-push hooks
      const stdin = await readStdinAsync(500);
      const lines = stdin.trim().split("\n");
      const parts = lines[0]?.split(" ") || [];
      const [localSha, remoteSha] = [parts[1], parts[3]];

      if (localSha && remoteSha && !/^0+$/.test(remoteSha)) {
        diff = execSync(`git diff ${remoteSha}..${localSha}`).toString().trim();
      } else {
        // Fallback for new branch or missing upstream
        try {
          diff = execSync("git diff @{u}..HEAD").toString().trim();
        } catch {
          diff = execSync("git diff HEAD~1..HEAD").toString().trim();
        }
      }
    } else if (allFiles) {
      // Scan all tracked files
      diff = execSync("git diff $(git hash-object -t tree /dev/null) HEAD").toString().trim();

      // Include untracked files by faking a diff
      try {
        const untracked = execSync("git ls-files --others --exclude-standard").toString().trim();
        if (untracked) {
          for (const file of untracked.split("\n")) {
            const content = await fs.readFile(file, "utf8");
            const fakeDiff = `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n${content
              .split("\n")
              .map((line) => `+${line}`)
              .join("\n")}\n`;
            diff += fakeDiff;
          }
        }
      } catch (e) {
        // Untracked scan error
      }
    } else if (all) {
      diff = execSync("git log --all -p").toString().trim();
    } else {
      // Default: uncommitted changes (staged + unstaged)
      try {
        diff = execSync("git diff HEAD").toString().trim();
      } catch (e) {
        // Fallback for initial commit
        diff = execSync("git diff $(git hash-object -t tree /dev/null)").toString().trim();
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
    console.error(
      chalk.red(`Failed to get git diff or metadata: ${e instanceof Error ? e.message : String(e)}`)
    );
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
      secrets,
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

/**
 * Reads stdin asynchronously with a timeout
 */
async function readStdinAsync(timeoutMs = 500): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => {
      process.stdin.pause();
      resolve(data);
    }, timeoutMs);

    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
