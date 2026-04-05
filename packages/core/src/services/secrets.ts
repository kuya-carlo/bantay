import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SECRETS_DIR = path.join(os.homedir(), ".bantay");
const SECRETS_PATH = path.join(SECRETS_DIR, "secrets");

/**
 * Encrypts a payload using AES-256-GCM
 */
function encryptSecrets(payload: Record<string, string>, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");

  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag,
    data: encrypted,
  });
}

/**
 * Decrypts a payload using AES-256-GCM
 */
function decryptSecrets(stored: string, key: Buffer): Record<string, string> {
  const { iv, tag, data } = JSON.parse(stored);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));

  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/**
 * Saves secrets to the encrypted store
 */
export async function saveSecrets(payload: Record<string, string>): Promise<void> {
  const masterKey = process.env.BANTAY_MASTER_KEY;
  if (!masterKey) {
    throw new Error("BANTAY_MASTER_KEY is not set.");
  }

  const key = Buffer.from(masterKey, "hex");
  const encrypted = encryptSecrets(payload, key);

  await fs.mkdir(SECRETS_DIR, { recursive: true });
  await fs.chmod(SECRETS_DIR, 0o700);

  await fs.writeFile(SECRETS_PATH, encrypted, "utf8");
  await fs.chmod(SECRETS_PATH, 0o600);
}

/**
 * Loads secrets from the encrypted store
 */
export async function loadSecrets(): Promise<Record<string, string>> {
  const masterKey = process.env.BANTAY_MASTER_KEY;

  // CI fallback or missing key
  if (!masterKey) return {};

  try {
    const content = await fs.readFile(SECRETS_PATH, "utf8");
    const key = Buffer.from(masterKey, "hex");
    return decryptSecrets(content, key);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.error(`[Secrets] Warning: Failed to load secrets. ${error.message}`);
    }
    return {};
  }
}
