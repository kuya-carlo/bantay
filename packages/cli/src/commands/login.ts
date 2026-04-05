import http from "node:http";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import readline from "node:readline";
import axios from "axios";
// @ts-ignore
import { saveSecrets, loadSecrets } from "@bantay/core";

/**
 * Collects all required inputs in a single readline session
 */
async function collectInputs(): Promise<{
  clientSecret: string;
  llmApiKey: string;
  ntfyTopic: string;
}> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  process.stdin.resume();

  const ask = (question: string, muted = false): Promise<string> =>
    new Promise((resolve) => {
      if (muted) {
        // @ts-ignore
        rl._writeToOutput = (s: string) => {
          if (["\r", "\n", "\r\n"].includes(s)) {
            (rl as any).output.write(s);
          }
        };
      } else {
        // @ts-ignore
        rl._writeToOutput = (s: string) => {
          (rl as any).output.write(s);
        };
      }
      process.stderr.write(question);
      rl.question("", resolve);
    });

  const existingSecrets = await loadSecrets();

  // 1. Auth0 Client Secret
  let clientSecret =
    process.env.BANTAY_AUTH0_CLIENT_SECRET || existingSecrets.BANTAY_AUTH0_CLIENT_SECRET;
  if (clientSecret) {
    console.log("✓ Auth0 client secret found in environment, skipping prompt.");
  } else {
    clientSecret = await ask("Enter your Auth0 client secret: ", true);
    process.stderr.write("\n");
  }

  // 2. LLM API Key
  let llmApiKey = process.env.BANTAY_LLM_API_KEY || existingSecrets.BANTAY_LLM_API_KEY;
  if (llmApiKey) {
    console.log("✓ LLM API key found in environment, skipping prompt.");
  } else {
    llmApiKey = await ask("Enter your LLM API key: ", true);
    process.stderr.write("\n");
  }

  // 3. ntfy topic — not a secret, skip if found in env/secrets
  let ntfyTopic = process.env.BANTAY_NTFY_TOPIC || existingSecrets.BANTAY_NTFY_TOPIC;
  if (ntfyTopic) {
    console.log(`✓ ntfy topic found in environment (${ntfyTopic}), skipping prompt.`);
  } else {
    ntfyTopic = await ask("Enter your ntfy topic (default: bantay): ");
    if (!ntfyTopic) ntfyTopic = "bantay";
  }

  rl.close();
  return { clientSecret, llmApiKey, ntfyTopic };
}

/**
 * Appends an export to the correct shell rc file or sets Windows env var
 */
async function updateShellRc(key: string, value: string) {
  process.env[key] = value;

  if (process.platform === "win32") {
    const command = `powershell.exe -Command "[System.Environment]::SetEnvironmentVariable('${key}', '${value}', 'User')"`;
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) {
          console.error(`⚠️  Failed to set Windows environment variable: ${error.message}`);
        } else {
          console.log("🔑 Master key set as a permanent Windows user environment variable.");
          console.log("   You may need to restart your terminal for it to take effect.");
        }
        resolve(null);
      });
    });
  }

  const shell = process.env.SHELL || "";
  let rcFile = "";
  let syntax = `export ${key}="${value}"`;
  let detected = true;

  if (shell.includes("zsh")) {
    rcFile = path.join(os.homedir(), ".zshrc");
  } else if (shell.includes("fish")) {
    rcFile = path.join(os.homedir(), ".config", "fish", "config.fish");
    syntax = `set -gx ${key} "${value}"`;
  } else if (shell.includes("bash")) {
    const bashrc = path.join(os.homedir(), ".bashrc");
    const bashProfile = path.join(os.homedir(), ".bash_profile");
    try {
      await fs.access(bashrc);
      rcFile = bashrc;
    } catch {
      try {
        await fs.access(bashProfile);
        rcFile = bashProfile;
      } catch {
        rcFile = bashrc;
      }
    }
  } else if (shell.includes("ksh")) {
    rcFile = path.join(os.homedir(), ".kshrc");
  } else if (shell.includes("dash") || shell.includes("sh")) {
    rcFile = path.join(os.homedir(), ".profile");
  } else {
    // Fallback detection
    const fallbacks = [
      path.join(os.homedir(), ".zshrc"),
      path.join(os.homedir(), ".bashrc"),
      path.join(os.homedir(), ".bash_profile"),
    ];
    for (const f of fallbacks) {
      try {
        await fs.access(f);
        rcFile = f;
        break;
      } catch {}
    }

    if (!rcFile) {
      rcFile = path.join(os.homedir(), ".profile");
      detected = false;
    }
  }

  try {
    let content = "";
    try {
      content = await fs.readFile(rcFile, "utf8");
    } catch (e) {}

    if (!content.includes(key)) {
      await fs.appendFile(rcFile, `\n${syntax}\n`);
    }

    if (!detected) {
      console.warn("⚠️  Could not detect shell. Written to ~/.profile as fallback.");
    }
    console.log(`🔑 Master key saved to ${rcFile}`);
    console.log(`   Run 'source ${rcFile}' to activate it in this session.`);
  } catch (error: any) {
    console.error(`❌ Failed to update ${rcFile}: ${error.message}`);
  }
}

export async function loginCommand(options: { tenant?: string } = {}) {
  const tenant = options.tenant || "default";
  const domain = process.env.BANTAY_AUTH0_DOMAIN || "kuyacarlo.jp.auth0.com";
  const clientId = process.env.BANTAY_AUTH0_CLIENT_ID || "zNuS01PgB3suIY9s6qkbUrav4dBu3bP1";

  // Step 1: Master Key
  const masterKey = crypto.randomBytes(32).toString("hex");
  await updateShellRc("BANTAY_MASTER_KEY", masterKey);

  // Step 2: Collect Inputs
  const { clientSecret, llmApiKey, ntfyTopic } = await collectInputs();

  const server = http.createServer(async (req, res) => {
    const port = process.env.BANTAY_AUTH_PORT || 3000;
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return res.end("Auth failed.");

      try {
        // 1. Exchange code for tokens
        const tokenRes = await axios.post(`https://${domain}/oauth/token`, {
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: process.env.BANTAY_REDIRECT_URI || `http://localhost:3000/callback`,
        });

        const { access_token } = tokenRes.data;

        // 2. Fetch user ID via /userinfo
        const userInfoRes = await axios.get(`https://${domain}/userinfo`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const auth0UserId = userInfoRes.data.sub;

        // 3. Save encrypted secrets
        await saveSecrets({
          BANTAY_AUTH0_CLIENT_SECRET: clientSecret,
          BANTAY_LLM_API_KEY: llmApiKey,
        });

        // 4. Update multi-tenant config
        const configDir = path.join(os.homedir(), ".bantay");
        const configPath = path.join(configDir, "config");
        await fs.mkdir(configDir, { recursive: true });
        await fs.chmod(configDir, 0o700);

        let globalConfig: any = { activeTenant: "default", tenants: {} };
        try {
          const existing = await fs.readFile(configPath, "utf-8");
          globalConfig = JSON.parse(existing);
          if (!globalConfig.tenants) {
            // Migrating legacy format
            const legacy = { ...globalConfig };
            globalConfig = { activeTenant: "default", tenants: { default: legacy } };
          }
        } catch (e) {}

        globalConfig.activeTenant = tenant;
        globalConfig.tenants[tenant] = {
          auth0UserId,
          auth0Domain: domain,
          auth0ClientId: clientId,
          ntfyTopic,
        };

        await fs.writeFile(configPath, JSON.stringify(globalConfig, null, 2));

        res.end("Login successful. Close this tab.");
        console.log(`\n✅ Logged in as ${auth0UserId} (Tenant: ${tenant})`);
        console.log("🔑 Secrets encrypted to ~/.bantay/secrets");
        console.log("⚠️  Restart your terminal or run: source ~/.bashrc");

        setTimeout(() => process.exit(0), 1000);
      } catch (error: any) {
        console.error("❌ Login failed:", error.response?.data || error.message);
        process.exit(1);
      }
    }
  });

  const port = process.env.BANTAY_AUTH_PORT || 3000;
  server.listen(port, () => {
    const authUrl =
      `https://${domain}/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: process.env.BANTAY_REDIRECT_URI || `http://localhost:3000/callback`,
        scope: "openid profile email",
        connection: "github",
      }).toString();

    console.log(`\n🌍 Opening browser for GitHub login...`);
    console.log(`   If the browser didn't open, visit this URL manually:`);
    console.log(`   ${authUrl}\n`);
    console.log("⏳ Waiting for browser login... (120s timeout)");

    try {
      const command = process.platform === "darwin" ? "open" : "xdg-open";
      exec(`${command} "${authUrl}"`);
    } catch (e) {
      // Swallowed as requested - the URL is printed as fallback
    }
  });

  setTimeout(() => {
    console.error("\n❌ Login timed out.");
    process.exit(1);
  }, 120000);
}
