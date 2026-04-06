import { lintSource } from "@secretlint/core";
import { creator as recommendPreset } from "@secretlint/secretlint-rule-preset-recommend";
import path from "node:path";
import { Finding } from "../types/schemas";
import { getGithubToken } from "./auth0";
import { getRepoVisibility } from "./github";
import { BantayConfig } from "./config";

/**
 * Pure Node.js service for secret detection in Bantay
 */
export class ScannerService {
  private fileNameRegex: RegExp[];

  private contentRegex: { pattern: RegExp; type: string }[] = [
    { pattern: /sk-ant-api\d{2}-[a-zA-Z0-9_-]{16,}/g, type: "Anthropic API Key" },
    { pattern: /sk-[a-zA-Z0-9]{48}/g, type: "OpenAI API Key" },
    { pattern: /sk-live-[a-zA-Z0-9]{20,}/g, type: "Stripe Live Key" },
    { pattern: /sk-test-[a-zA-Z0-9]{20,}/g, type: "Stripe Test Key" },
    { pattern: /rk_live_[a-zA-Z0-9]{20,}/g, type: "Stripe Restricted Key" },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: "GitHub Personal Access Token" },
    { pattern: /ghs_[a-zA-Z0-9]{36}/g, type: "GitHub App Token" },
    { pattern: /AKIA[0-9A-Z]{16}/g, type: "AWS Access Key" },
    { pattern: /[a-z0-9]{32}-us[0-9]{1,2}/g, type: "Mailchimp API Key" },
    { pattern: /xox[baprs]-[0-9a-zA-Z]{10,}/g, type: "Slack Token" },
    { pattern: /AIza[0-9A-Za-z\-_]{35}/g, type: "Google API Key" },
    {
      pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      type: "JWT Token",
    },
    { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, type: "Private Key" },
    { pattern: /ya29\.[0-9A-Za-z\-_/]+/g, type: "Google OAuth Access Token" },
    { pattern: /access_token=[a-z0-9]{32}/g, type: "OAuth Access Token" },
    { pattern: /refresh_token=[a-z0-9]{32}/g, type: "OAuth Refresh Token" },
    {
      pattern: /https?:\/\/[^\s"\[]*[?&](?:api_key|client_secret|token|key)=[^&"'\s]+/g,
      type: "Credential in URL",
    },
    { pattern: /AQE[A-Za-z0-9][^"'\s]{16,}/g, type: "AWS Secret Key" },
    {
      pattern: /-----BEGIN\s+(PGP|CERTIFICATE|SSH|OPENSSH)\s+PRIVATE\s+KEY-----/g,
      type: "Other Private Key",
    },
    { pattern: /ssh-rsa\s+[A-Za-z0-9\/+]{100,}/g, type: "SSH Public Key (ID)" },
  ];

  constructor(private config: BantayConfig) {
    this.fileNameRegex = (this.config.scan.sensitiveFiles || []).map((glob) => {
      // Simple glob to regex conversion: *.pem -> /\.pem$/, id_rsa -> /id_rsa$/
      const pattern = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars (dot, plus, etc.)
        .replace(/\*/g, ".*"); // * -> .*
      return new RegExp(`${pattern}$`);
    });
  }

  /**
   * Scans a git diff for secrets
   */
  async scanDiff(diff: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const files = this.parseDiff(diff);

    for (const file of files) {
      const basename = path.basename(file.path);

      // 1. Filename based check
      if (this.fileNameRegex.some((regex) => regex.test(basename))) {
        let riskTier: "high" | "medium" | "low" = "high";

        // Source maps are always medium risk
        if (basename.endsWith(".map")) {
          riskTier = "medium";
        }

        findings.push({
          file: file.path,
          line_number: 1,
          type: "Sensitive Filename",
          value: file.path,
          riskTier,
        });
      }

      // 2. Content based check using secretlint
      try {
        const result = await lintSource({
          source: { content: file.content, filePath: file.path, contentType: "text" },
          options: {
            config: {
              rules: [{ id: "recommend", rule: recommendPreset }],
            },
          },
        });

        for (const message of result.messages) {
          findings.push({
            file: file.path,
            line_number: message.loc.start.line,
            type: message.messageId || "Secret Detection",
            value: message.message,
            riskTier: "high", // Content secrets are always high risk
          });
        }
      } catch (error) {
        console.error(
          `[Scanner] Error linting ${file.path}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // 3. Content regex layer
      file.content.split("\n").forEach((lineContent, lineIndex) => {
        for (const { pattern, type } of this.contentRegex) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(lineContent)) !== null) {
            findings.push({
              file: file.path,
              line_number: lineIndex + 1,
              type,
              value: match[0].substring(0, 8) + "***",
              riskTier: "high",
            });
          }
        }

        // 4. High entropy string detection
        if (this.isHighEntropyString(lineContent)) {
          findings.push({
            file: file.path,
            line_number: lineIndex + 1,
            type: "High Entropy String",
            value: lineContent.substring(0, 20) + "***",
            riskTier: "high",
          });
        }
      });
    }

    return findings;
  }

  /**
   * Simplistic diff parser to extract file paths and contents
   */
  private parseDiff(diff: string): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];
    if (!diff) return [];

    const lines = diff.split("\n");
    let currentFile: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        // Save previous file
        if (currentFile && currentContent.length > 0) {
          files.push({ path: currentFile, content: currentContent.join("\n") });
        }
        // Extract filename
        const parts = line.split(" ");
        const bPath = parts[parts.length - 1]; // "b/filename"
        currentFile = bPath && bPath.startsWith("b/") ? bPath.substring(2) : "unknown";
        currentContent = [];
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        currentContent.push(line.substring(1));
      }
    }

    // Save last file
    if (currentFile && currentContent.length > 0) {
      files.push({ path: currentFile, content: currentContent.join("\n") });
    }

    return files;
  }

  /**
   * Check if a string has high entropy (potential secret)
   * @param s - Input string
   * @returns boolean indicating if string has high entropy
   */
  private isHighEntropyString(s: string): boolean {
    // Skip short strings and obvious non-secrets
    if (s.length < 20 || /^\s*$/.test(s) || s.length > 1000) {
      return false;
    }

    // Skip strings with long sequences of the same character
    if (/(.)\1{10,}/.test(s)) {
      return false;
    }

    // Skip strings that are mostly spaces or common delimiters
    const nonAlphaNum = s.replace(/[a-zA-Z0-9]/g, "").length;
    if (nonAlphaNum / s.length > 0.7) {
      return false;
    }

    // Skip URLs and email addresses
    if (/https?:\/\/|@/.test(s)) {
      return false;
    }

    return this.shannonEntropy(s) > 4.5;
  }

  /**
   * Calculate Shannon entropy of a string
   * @param s - Input string (e.g., a potential secret)
   * @returns Entropy value in bits (typically 0–6.0 for ASCII)
   */
  private shannonEntropy(s: string): number {
    const len = s.length;
    if (len === 0) return 0;

    // Build frequency map
    const freq: Record<string, number> = {};
    for (const char of s) {
      freq[char] = (freq[char] || 0) + 1;
    }

    // Calculate entropy
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const probability = count / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }
}
