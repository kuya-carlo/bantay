import axios from "axios";
import { loadSecrets } from "./secrets";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Resolves an Auth0 related value from env, encrypted secrets, or global config
 */
async function resolveAuth0Value(
  envVar: string,
  configKey: string,
  isSecret = false
): Promise<string> {
  // 1. Env Var (BANTAY_ prefix)
  if (process.env[envVar]) return process.env[envVar]!;

  // 2. Encrypted Secrets (BANTAY_ prefix)
  const secrets = await loadSecrets();
  if (secrets[envVar]) return secrets[envVar];

  // 3. Global Config (only for non-secrets)
  if (!isSecret) {
    try {
      const configPath = path.join(os.homedir(), ".bantay", "config");
      const content = await fs.readFile(configPath, "utf-8");
      const globalConfigRaw = JSON.parse(content);
      const activeTenant = globalConfigRaw.activeTenant || "default";
      const tenants = globalConfigRaw.tenants || {};
      const config = tenants[activeTenant] || globalConfigRaw; // Fallback
      if (config[configKey]) return config[configKey];
    } catch (e) {}
  }

  throw new Error(`Not authenticated. Run 'bantay login' first. (Missing ${envVar})`);
}

/**
 * Gets a Management API token from Auth0
 */
export async function getManagementToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const domain = await resolveAuth0Value("BANTAY_AUTH0_DOMAIN", "auth0Domain");
  const clientId = await resolveAuth0Value("BANTAY_AUTH0_CLIENT_ID", "auth0ClientId");
  const clientSecret = await resolveAuth0Value("BANTAY_AUTH0_CLIENT_SECRET", "", true);

  try {
    const res = await axios.post(`https://${domain}/oauth/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
      scope: "read:user_idp_tokens",
    });

    cachedToken = res.data.access_token;
    tokenExpiry = now + res.data.expires_in - 60; // 1 minute buffer
    return cachedToken!;
  } catch (error: any) {
    const errorMsg = error.response?.data?.error_description || error.message;
    throw new Error(`Auth0 Management Token Error: ${errorMsg}`);
  }
}

/**
 * Retrieves a GitHub access token for a given Auth0 user
 */
export async function getGithubToken(auth0UserId: string): Promise<string> {
  const domain = await resolveAuth0Value("BANTAY_AUTH0_DOMAIN", "auth0Domain");
  const managementToken = await getManagementToken();

  try {
    const res = await axios.get(
      `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
      {
        headers: { Authorization: `Bearer ${managementToken}` },
      }
    );

    const githubIdentity = res.data.identities?.find((id: any) => id.provider === "github");
    if (!githubIdentity?.access_token) {
      throw new Error(`No GitHub access token found for user ${auth0UserId}`);
    }

    return githubIdentity.access_token;
  } catch (error: any) {
    const message = error.response?.data?.message || error.message;
    throw new Error(`Auth0 User API Error: ${message}`);
  }
}

/**
 * Resets the in-memory cache (for testing)
 */
export function resetTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}
