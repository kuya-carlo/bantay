import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScannerService } from "../src/services/scanner";
import { BantayConfig } from "../src/services/config";

// Mock dependencies
vi.mock("../src/services/auth0", () => ({
  getGithubToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../src/services/github", () => ({
  getRepoVisibility: vi.fn().mockResolvedValue("private"),
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
    const findings = await scanner.scanDiff(diff, "public");

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "key.pem",
      type: "Sensitive Filename",
      riskTier: "high",
    });
  });

  it("should apply visibility-aware risk tiers for .map files (public)", async () => {
    const diff = `diff --git a/app.js.map b/app.js.map\nnew file mode 100644\n--- /dev/null\n+++ b/app.js.map\n@@ -0,0 +1 @@\n+{"version":3}`;
    const findings = await scanner.scanDiff(diff, "public");

    expect(findings[0].riskTier).toBe("high");
  });

  it("should apply visibility-aware risk tiers for .map files (private)", async () => {
    const diff = `diff --git a/app.js.map b/app.js.map\nnew file mode 100644\n--- /dev/null\n+++ b/app.js.map\n@@ -0,0 +1 @@\n+{"version":3}`;
    const findings = await scanner.scanDiff(diff, "private");

    expect(findings[0].riskTier).toBe("medium");
  });

  it("should detect hardcoded secrets via regex", async () => {
    const diff = `diff --git a/index.js b/index.js\n--- a/index.js\n+++ b/index.js\n@@ -1 +1,2 @@\n+const key = "sk-ant-api03-12345678901234567";`;
    const findings = await scanner.scanDiff(diff, "public");

    expect(findings.some((f) => f.type === "Anthropic API Key")).toBe(true);
    expect(findings.find((f) => f.type === "Anthropic API Key")?.riskTier).toBe("high");
  });
});
