import { lintSource } from "@secretlint/core";
import { creator as recommendPreset } from "@secretlint/secretlint-rule-preset-recommend";
import path from "node:path";
import { Finding } from "../types/schemas";

/**
 * Pure Node.js service for secret detection in Bantay
 */
export class ScannerService {
  private fileNameRegex = [
    /\.pem$/, /\.key$/, /id_rsa$/, /\.env$/, /credentials\.json$/, /\.pfx$/, /\.map$/
  ];

  private contentRegex: { pattern: RegExp; type: string }[] = [
    { pattern: /sk-ant-api\d{2}-[a-zA-Z0-9_-]{16,}/g, type: "Anthropic API Key" },
    { pattern: /sk-[a-zA-Z0-9]{48}/g, type: "OpenAI API Key" },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: "GitHub Personal Access Token" },
    { pattern: /ghs_[a-zA-Z0-9]{36}/g, type: "GitHub App Token" },
    { pattern: /AKIA[0-9A-Z]{16}/g, type: "AWS Access Key" },
    { pattern: /[a-z0-9]{32}-us[0-9]{1,2}/g, type: "Mailchimp API Key" },
    { pattern: /xox[baprs]-[0-9a-zA-Z]{10,}/g, type: "Slack Token" },
    { pattern: /AIza[0-9A-Za-z\-_]{35}/g, type: "Google API Key" },
    { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, type: "JWT Token" },
    { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, type: "Private Key" },
  ];

  /**
   * Scans a git diff for secrets using secretlint and filename regex
   */
  async scanDiff(diff: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    console.log("[Scanner] Parsing diff...");
    const files = this.parseDiff(diff);
    console.log(`[Scanner] Found ${files.length} files in diff.`);

    for (const file of files) {
      // 1. Filename based check
      if (this.isSensitiveFile(file.path)) {
        console.log(`[Scanner] Sensitive filename hit: ${file.path}`);
        findings.push({
          file: file.path,
          line_number: 1,
          type: "Sensitive Filename",
          value: file.path,
        });
      }

      // 2. Content based check using secretlint
      try {
        console.log(`[Scanner] Linting content of ${file.path} (${file.content.length} chars)`);
        const result = await lintSource({
          source: {
            content: file.content,
            filePath: file.path,
            contentType: "text",
          },
          options: {
            config: {
              rules: [
                {
                  id: "recommend",
                  rule: recommendPreset,
                },
              ],
            },
          },
        });

        if (result.messages.length > 0) {
          console.log(`[Scanner] Found ${result.messages.length} secrets in ${file.path}`);
        }

        for (const message of result.messages) {
          findings.push({
            file: file.path,
            line_number: message.loc.start.line,
            type: message.messageId || "Secret Detection",
            value: message.message,
          });
        }
      } catch (error) {
        console.error(`[Scanner] Error linting ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 3. Content regex layer for patterns Secretlint misses
      const lines = file.content.split("\n");
      lines.forEach((lineContent, lineIndex) => {
        for (const { pattern, type } of this.contentRegex) {
          pattern.lastIndex = 0; // reset regex state
          const match = pattern.exec(lineContent);
          if (match) {
            findings.push({
              file: file.path,
              line_number: lineIndex + 1,
              type,
              value: match[0].substring(0, 8) + "***", // mask the value
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

  private isSensitiveFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return this.fileNameRegex.some((regex) => regex.test(basename));
  }
}
