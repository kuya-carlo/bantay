import { lintSource } from "@secretlint/core";
import { creator as recommendPreset } from "@secretlint/secretlint-rule-preset-recommend";
import path from "node:path";
import { Finding } from "../types/schemas.js";

/**
 * Pure Node.js service for secret detection in Bantay
 */
export class ScannerService {
  private fileNameRegex = [
    /\.pem$/, /\.key$/, /id_rsa$/, /\.env$/, /credentials\.json$/, /\.pfx$/, /\.map$/
  ];

  /**
   * Scans a git diff for secrets using secretlint and filename regex
   */
  async scanDiff(diff: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const files = this.parseDiff(diff);

    for (const file of files) {
      // 1. Filename based check
      if (this.isSensitiveFile(file.path)) {
        findings.push({
          file: file.path,
          line: 1,
          type: "Sensitive Filename",
          value: file.path,
        });
      }

      // 2. Content based check using secretlint
      try {
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

        for (const message of result.messages) {
          findings.push({
            file: file.path,
            line: message.loc.start.line,
            type: message.messageId || "Secret Detection",
            value: message.message,
          });
        }
      } catch (error) {
        console.error(`[Scanner] Error linting ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
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
        if (currentFile && currentContent.length > 0) {
          files.push({ path: currentFile, content: currentContent.join("\n") });
        }
        // Extract filename from diff --git a/file b/file
        const match = line.match(/b\/(.*)$/);
        currentFile = match ? match[1] : "unknown";
        currentContent = [];
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        currentContent.push(line.substring(1));
      }
    }

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
