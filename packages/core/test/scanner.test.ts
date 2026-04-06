import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScannerService } from "../src/services/scanner";
import { BantayConfig } from "../src/services/config";



vi.mock("@secretlint/core", () => ({
  lintSource: vi.fn().mockResolvedValue({ messages: [] }),
}));

describe("ScannerService", () => {
  let config: BantayConfig;
  let scanner: ScannerService;

  beforeEach(() => {
    config = {
      ntfy: { topic: "test" },
      git: { protectedBranches: ["main"] },
      thresholds: { chungusLineCount: 100 },
      scan: {
        sensitiveFiles: ["*.pem", "id_rsa", "*.map"],
        sourceMaps: { publicRepo: "high", privateRepo: "medium" },
        blockOnTimeout: true,
        cibaTimeoutSeconds: 60,
      },
    };
    scanner = new ScannerService(config);
  });

  it("should detect sensitive filenames based on config globs", async () => {
    const diff = `diff --git a/key.pem b/key.pem\nnew file mode 100644\n--- /dev/null\n+++ b/key.pem\n@@ -0,0 +1 @@\n+some data`;
    const findings = await scanner.scanDiff(diff);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "key.pem",
      type: "Sensitive Filename",
      riskTier: "high",
    });
  });

  it("should apply medium risk tier for .map files", async () => {
    const diff = `diff --git a/app.js.map b/app.js.map\nnew file mode 100644\n--- /dev/null\n+++ b/app.js.map\n@@ -0,0 +1 @@\n+{"version":3}`;
    const findings = await scanner.scanDiff(diff);

    expect(findings[0].riskTier).toBe("medium");
  });

  it("should detect hardcoded secrets via regex", async () => {
    const diff = `diff --git a/index.js b/index.js\n--- a/index.js\n+++ b/index.js\n@@ -1 +1,2 @@\n+const key = "sk-ant-api03-12345678901234567";`;
    const findings = await scanner.scanDiff(diff);

    expect(findings.some((f) => f.type === "Anthropic API Key")).toBe(true);
    expect(findings.find((f) => f.type === "Anthropic API Key")?.riskTier).toBe("high");
  });

  it("should return empty findings for an empty diff", async () => {
    const findings = await scanner.scanDiff("");
    expect(findings).toEqual([]);
  });

  it("should return empty findings for a diff with only deletions", async () => {
    const diff = `diff --git a/index.js b/index.js\n--- a/index.js\n+++ b/index.js\n@@ -1 +0,0 @@\n-const key = "ghp_123456789012345678901234567890123456";`;
    const findings = await scanner.scanDiff(diff);
    expect(findings).toEqual([]);
  });

  it("should process a chungus commit (>1000 lines) without throwing", async () => {
    const lines = Array.from({ length: 1100 }, (_, i) => `+line ${i}`).join("\n");
    const diff = `diff --git a/large.txt b/large.txt\n--- /dev/null\n+++ b/large.txt\n@@ -0,0 +1,1100 @@\n${lines}`;
    const findings = await scanner.scanDiff(diff);
    expect(findings).toBeDefined();
  });

  it("should return separate findings for sensitive filename AND secret content", async () => {
    const diff = `diff --git a/key.pem b/key.pem\n--- /dev/null\n+++ b/key.pem\n@@ -0,0 +1 @@\n+const key = "ghp_123456789012345678901234567890123456";`;
    const findings = await scanner.scanDiff(diff);

    expect(findings.filter((f) => f.type === "Sensitive Filename")).toHaveLength(1);
    expect(findings.filter((f) => f.type === "GitHub Personal Access Token")).toHaveLength(1);
  });

  it("should catch Secretlint errors and continue scanning", async () => {
    const { lintSource } = await import("@secretlint/core");
    vi.mocked(lintSource).mockRejectedValueOnce(new Error("Lint Crash"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const diff = `diff --git a/a.js b/a.js\n+++ b/a.js\n+ghp_123456789012345678901234567890123456\ndiff --git b/b.js b/b.js\n+++ b/b.js\n+ghp_123456789012345678901234567890123456`;
    const findings = await scanner.scanDiff(diff);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error linting a.js: Lint Crash")
    );
    // Should still find the secret in b.js (via regex layer even if linter failed)
    expect(findings.length).toBeGreaterThan(0);
  });

  it("should process messages returned from Secretlint", async () => {
    const { lintSource } = await import("@secretlint/core");
    vi.mocked(lintSource).mockResolvedValueOnce({
      filePath: "test.txt",
      sourceContent: "secret_data",
      sourceContentType: "text",
      messages: [
        {
          loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
          message: "Secret found",
          messageId: "found-secret",
        },
      ] as any,
    });

    const diff = `diff --git a/test.txt b/test.txt\n+++ b/test.txt\n+secret_data`;
    const findings = await scanner.scanDiff(diff);

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: "found-secret",
        value: "Secret found",
        riskTier: "high",
      })
    );
  });


});
