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
   * Fetches repository visibility metadata via GitHub API
   */
  async getRepoMetadata(remoteUrl: string): Promise<{ repoVisibility: "public" | "private" }> {
    const userId = process.env.BANTAY_AUTH0_USER_ID;
    if (!userId) {
      console.error("[Scanner] Warning: BANTAY_AUTH0_USER_ID not set. Defaulting to public.");
      return { repoVisibility: "public" };
    }

    try {
      const match = remoteUrl.match(
        /(?:git@github\.com:|https:\/\/github\.com\/)([^\/]+)\/([^\/\.]+)(?:\.git)?/
      );
      if (!match) {
        throw new Error(`Could not parse GitHub owner/repo from ${remoteUrl}`);
      }
      const [, owner, repo] = match;

      const token = await getGithubToken(userId);
      const visibility = await getRepoVisibility(owner, repo, token);

      return { repoVisibility: visibility };
    } catch (error: any) {
      console.warn(
        `[Scanner] Warning: GitHub visibility check failed. Defaulting to public. Error: ${error.message}`
      );
      return { repoVisibility: "public" };
    }
  }

  /**
   * Scans a git diff for secrets
   */
  async scanDiff(diff: string, repoVisibility: "public" | "private"): Promise<Finding[]> {
    const findings: Finding[] = [];
    const files = this.parseDiff(diff);

    for (const file of files) {
      const basename = path.basename(file.path);

      // 1. Filename based check
      if (this.fileNameRegex.some((regex) => regex.test(basename))) {
        let riskTier: "high" | "medium" | "low" = "high";

        // Visibility-aware risk tier for .map files
        if (basename.endsWith(".map")) {
          riskTier =
            repoVisibility === "public"
              ? this.config.scan.sourceMaps.publicRepo
              : this.config.scan.sourceMaps.privateRepo;
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
          const match = pattern.exec(lineContent);
          if (match) {
            findings.push({
              file: file.path,
              line_number: lineIndex + 1,
              type,
              value: match[0].substring(0, 8) + "***",
              riskTier: "high",
            });
          }
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
}
