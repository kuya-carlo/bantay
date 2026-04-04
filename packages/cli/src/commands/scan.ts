import { execSync } from "node:child_process";
// @ts-ignore
import { buildGraph } from "@git-guardian/core";
// @ts-ignore
import { Auth0Service, NotificationService, ConfigService } from "@git-guardian/core";
import { formatAssessment, formatFindings, formatInterrupt } from "../formatters";
import chalk from "chalk";

/**
 * Executes the git-guardian scan command
 */
export async function scanCommand() {
  const configService = new ConfigService();
  const config = await configService.load(process.cwd());

  const notificationService = new NotificationService({
    baseURL: "https://ntfy.kuyacarlo.dev",
    user: "karlo",
    pass: process.env.NTFY_PASSWORD || "",
  });

  const auth0 = new Auth0Service({
    domain: process.env.AUTH0_DOMAIN || "kuyacarlo.jp.auth0.com",
    clientId: process.env.AUTH0_CLIENT_ID || "",
    clientSecret: process.env.AUTH0_CLIENT_SECRET || "",
    notificationService,
    ntfyTopic: config.ntfy.topic,
  });

  // 1. Get staged changes
  let diff = "";
  try {
    diff = execSync("git diff --staged").toString();
    if (!diff) {
      console.log(chalk.green("No staged changes to scan."));
      return;
    }
  } catch (e) {
    console.error(chalk.red("Failed to get git diff. Are you in a git repository?"));
    process.exit(1);
  }

  // 2. Initialize and run graph
  console.log(chalk.blue("🛡️  Git Guardian: Scanning staged changes..."));
  const graph = buildGraph();
  const threadID = `push-${Date.now()}`;
  const runConfig = { configurable: { thread_id: threadID } };

  try {
    const result = await graph.invoke({ diff, approved: null }, runConfig);
    
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
       
       // In a real CLI hook, we might block or poll.
       // The GraphResumer would normally handle this, but for the pre-push hook,
       // we might want to wait synchronously or instruct the user to check their device.
       
       // For MVP, we'll try to resume briefly or fail-closed if no response.
       console.log(chalk.dim("Waiting for authorization..."));
       
       // We'll give it a 30s timeout
       let finalApproved = null;
       const startTime = Date.now();
       
       while (Date.now() - startTime < 30000) {
          await new Promise(r => setTimeout(r, 2000));
          const state = await graph.getState(runConfig);
          if (state.values.approved !== null) {
              finalApproved = state.values.approved;
              break;
          }
       }

       if (finalApproved === true) {
          console.log(chalk.green("✅ Authorization received. Push allowed."));
          process.exit(0);
       } else {
          console.log(chalk.red("❌ Authorization denied or timed out. Push blocked."));
          process.exit(1);
       }
    }
  } catch (error) {
    console.error(chalk.red(`\n🚨 Error during scan: ${error instanceof Error ? error.message : String(error)}`));
    // Fail-Closed
    process.exit(1);
  }
}
