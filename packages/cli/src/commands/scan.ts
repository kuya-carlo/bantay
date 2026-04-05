import { execSync } from "node:child_process";
import axios from 'axios';
// @ts-ignore
import { buildGraph } from "@bantay/core";
// @ts-ignore
import { Auth0Service, NotificationService, ConfigService } from "@bantay/core";
import { formatAssessment, formatFindings, formatInterrupt } from "../formatters";
import chalk from "chalk";

/**
 * Executes the bantay scan command
 */
export async function scanCommand() {
  if (process.env.BANTAY_FORCE === "1") {
    console.log(chalk.yellow("⚠️  Bantay: Force bypass detected (BANTAY_FORCE=1). Skipping security scan."));
    process.exit(0);
  }

  const missingVars = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'VULTR_API_KEY', 'AUTH0_USER_ID']
    .filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(chalk.yellow(`⚠️  Missing env vars: ${missingVars.join(', ')}. Some features may not work.`));
  }

  const configService = new ConfigService();
  const config = await configService.load(process.cwd());

  const notificationService = new NotificationService();

  const auth0 = new Auth0Service({
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
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
  console.log(chalk.blue("🛡️  Bantay: Scanning staged changes..."));
  const graph = await buildGraph();

  try {
    const result = await graph.invoke({ diff, approved: null });
    
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
           `🛡️ Bantay detected secrets requiring approval.\n\nFindings: ${result.findings?.map((f: any) => `${f.type} in ${f.file}`).join(', ')}\n\nApprove or deny this push from your ntfy client.`
         );
         console.log(chalk.dim("📱 Notification sent to your device."));
       } catch (e) {
         console.warn(chalk.yellow("⚠️  Could not send ntfy notification."));
       }
       
       // Direct CIBA polling
       const loginHint = JSON.stringify({
         format: "iss_sub",
         iss: `https://${process.env.AUTH0_DOMAIN}/`,
         sub: process.env.AUTH0_USER_ID
       });

       let authReqId: string;
       try {
         const cibaRes = await axios.post(
           `https://${process.env.AUTH0_DOMAIN}/bc-authorize`,
           new URLSearchParams({
             client_id: process.env.AUTH0_CLIENT_ID!,
             client_secret: process.env.AUTH0_CLIENT_SECRET!,
             binding_message: `Bantay: ${result.findings?.length} secrets detected. Authorize this push.`,
             login_hint: loginHint,
             scope: 'openid',
           }),
           { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
         );
         authReqId = cibaRes.data.auth_req_id;
         console.log(chalk.dim('🔐 Auth0 CIBA initiated. Waiting for approval on your Guardian app...'));
       } catch (e: any) {
         console.error(chalk.red(`❌ CIBA initiation failed: ${e.response?.data?.error_description || e.message}`));
         process.exit(1);
       }

       const startTime = Date.now();
       const timeout = 60000;
       const interval = 5000;

       while (Date.now() - startTime < timeout) {
         await new Promise(r => setTimeout(r, interval));
         try {
           const tokenRes = await axios.post(
             `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
             new URLSearchParams({
               client_id: process.env.AUTH0_CLIENT_ID!,
               client_secret: process.env.AUTH0_CLIENT_SECRET!,
               grant_type: 'urn:openid:params:grant-type:ciba',
               auth_req_id: authReqId,
             }),
             { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
           );
           if (tokenRes.data.access_token) {
             console.log(chalk.green('✅ Authorization approved. Push allowed.'));
             process.exit(0);
           }
         } catch (e: any) {
           const errCode = e.response?.data?.error;
           if (errCode === 'authorization_pending') {
             console.log(chalk.dim('⏳ Waiting for Guardian approval...'));
             continue;
           } else if (errCode === 'access_denied') {
             console.log(chalk.red('❌ Authorization denied. Push blocked.'));
             process.exit(1);
           } else if (errCode === 'expired_token') {
             console.log(chalk.red('❌ Authorization request expired. Push blocked.'));
             process.exit(1);
           } else {
             console.error(chalk.red(`❌ CIBA polling error: ${e.response?.data?.error_description || e.message}`));
             process.exit(1);
           }
         }
       }

       console.log(chalk.red('❌ Authorization timed out. Push blocked.'));
       process.exit(1);
     }
  } catch (error) {
    console.error(chalk.red(`\n🚨 Error during scan: ${error instanceof Error ? error.message : String(error)}`));
    // Fail-Closed
    process.exit(1);
  }
}
