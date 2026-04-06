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
}> {
  const existingSecrets = await loadSecrets();

  const clientSecretEnv =
    process.env.BANTAY_AUTH0_CLIENT_SECRET || existingSecrets.BANTAY_AUTH0_CLIENT_SECRET;
  const llmApiKeyEnv = process.env.BANTAY_LLM_API_KEY || existingSecrets.BANTAY_LLM_API_KEY;
  const ntfyTopicEnv = process.env.BANTAY_NTFY_TOPIC || existingSecrets.BANTAY_NTFY_TOPIC;

  if (clientSecretEnv && llmApiKeyEnv) {
    console.log("✓ All credentials found, skipping prompts.");
    return {
      clientSecret: clientSecretEnv,
      llmApiKey: llmApiKeyEnv,
    };
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  process.stdin.resume();

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, resolve);
    });

  // 1. Auth0 Client Secret
  let clientSecret = clientSecretEnv;
  if (clientSecret) {
    console.log("✓ Auth0 client secret found in environment, skipping prompt.");
  } else {
    clientSecret = await ask("Enter your Auth0 client secret: ");
    process.stdout.write("\n");
  }

  // 2. LLM API Key
  let llmApiKey = llmApiKeyEnv;
  if (llmApiKey) {
    console.log("✓ LLM API key found in environment, skipping prompt.");
  } else {
    llmApiKey = await ask("Enter your LLM API key: ");
    process.stdout.write("\n");
  }

  rl.close();
  return { clientSecret, llmApiKey };
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
  let masterKey = process.env.BANTAY_MASTER_KEY;
  if (!masterKey) {
    masterKey = crypto.randomBytes(32).toString("hex");
    await updateShellRc("BANTAY_MASTER_KEY", masterKey);
  } else {
    console.log("✓ Reusing existing master key found in environment.");
  }

  // Step 2: Secrets Validation
  const secretsPath = path.join(os.homedir(), ".bantay", "secrets");
  try {
    await fs.access(secretsPath);
    const existing = await loadSecrets();
    if (Object.keys(existing).length === 0) {
      // File exists but decryption failed (returns {} on catch)
      throw new Error("Decryption failed");
    }
    console.log("✓ Existing secrets are valid and readable.");
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      try {
        await fs.unlink(secretsPath);
        console.log("⚠️  Stale or undecryptable secrets file removed.");
        console.log(
          "💡 Tip: Use 'bantay login --tenant work' or '--tenant personal' to manage multiple accounts."
        );
        console.log(
          "   The 'activeTenant' in ~/.bantay/config controls which one is currently in use."
        );
      } catch {}
    }
  }

  // Step 3: Collect Inputs
  const { clientSecret, llmApiKey } = await collectInputs();
  const ntfyTopic = process.env.BANTAY_NTFY_TOPIC || "bantay";

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
        let auth0UserId = userInfoRes.data.sub;

        // Bug 2: Map github| identity to primary auth0| identity
        if (auth0UserId.startsWith("github|")) {
          try {
            const mgmtTokenRes = await axios.post(`https://${domain}/oauth/token`, {
              grant_type: "client_credentials",
              client_id: clientId,
              client_secret: clientSecret,
              audience: `https://${domain}/api/v2/`,
              scope: "read:users",
            });

            const identitiesRes = await axios.get(
              `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}/identities`,
              {
                headers: {
                  Authorization: `Bearer ${mgmtTokenRes.data.access_token}`,
                },
              }
            );

            const auth0Identity = identitiesRes.data.find((id: any) => id.provider === "auth0");
            if (auth0Identity) {
              auth0UserId = `auth0|${auth0Identity.user_id}`;
              console.log(`✓ Resolved primary Auth0 identity: ${auth0UserId}`);
            }
          } catch (e: any) {
            console.warn(`⚠️  Identity mapping failed: ${e.message}. Using original ID.`);
          }
        }

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
