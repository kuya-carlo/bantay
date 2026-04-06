import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanCommand } from "../commands/scan";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import axios from "axios";

// Mock dependencies
vi.mock("node:child_process");
vi.mock("node:fs/promises");
vi.mock("axios");
vi.mock("@bantay/core", () => ({
  ScannerService: vi.fn(),
  buildGraph: vi.fn().mockResolvedValue({
    invoke: vi.fn().mockResolvedValue({
      findings: [],
      riskAssessment: { tier: "low", reason: "Safe", suggestion: "None" },
      approved: true,
    }),
  }),
  NotificationService: vi.fn().mockImplementation(() => ({
    sendAlert: vi.fn().mockResolvedValue(undefined),
  })),
  ConfigService: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({ scan: {}, ntfy: { topic: "test" } }),
  })),
  loadSecrets: vi.fn().mockResolvedValue({
    BANTAY_AUTH0_CLIENT_ID: "test-id",
    BANTAY_AUTH0_CLIENT_SECRET: "test-secret",
    BANTAY_AUTH0_USER_ID: "test-user",
  }),
}));

describe("scanCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BANTAY_AUTH0_CLIENT_SECRET", "test-secret");
  });

  it("should scan uncommitted changes by default", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("diff content") as any);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await scanCommand();

    expect(execSync).toHaveBeenCalledWith("git diff HEAD");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should scan staged changes with --staged", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("staged diff") as any);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await scanCommand({ staged: true });

    expect(execSync).toHaveBeenCalledWith("git diff --cached");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should handle empty diff gracefully", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("") as any);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await scanCommand();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No changes to scan"));
  });
});
