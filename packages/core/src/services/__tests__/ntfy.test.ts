import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { NotificationService } from "../ntfy";

vi.mock("axios");
vi.mock("node:readline");
vi.mock("../secrets", () => ({
  loadSecrets: vi.fn().mockResolvedValue({}),
  saveSecrets: vi.fn().mockResolvedValue(undefined),
}));

describe("NotificationService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BANTAY_NTFY_URL", "");
    vi.stubEnv("BANTAY_NTFY_USERNAME", "");
    vi.stubEnv("BANTAY_NTFY_PASSWORD", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should POST to the correct ntfy URL with correct headers", async () => {
    vi.stubEnv("BANTAY_NTFY_URL", "https://custom.ntfy.dev");
    const ntfy = new NotificationService();

    await ntfy.sendAlert("test-topic", "test-message");

    expect(axios.post).toHaveBeenCalledWith(
      "https://custom.ntfy.dev/test-topic",
      "test-message",
      expect.objectContaining({
        headers: expect.objectContaining({
          Title: "Bantay Security Alert",
          Priority: "4",
        }),
      })
    );
  });

  it("should fall back to ntfy.sh if BANTAY_NTFY_URL is missing", async () => {
    const ntfy = new NotificationService();
    await ntfy.sendAlert("test-topic", "test-message");

    expect(axios.post).toHaveBeenCalledWith(
      "https://ntfy.sh/test-topic",
      "test-message",
      expect.any(Object)
    );
  });

  it("should include Basic auth header when credentials are set in env", async () => {
    vi.stubEnv("BANTAY_NTFY_USERNAME", "myuser");
    vi.stubEnv("BANTAY_NTFY_PASSWORD", "mypass");

    const ntfy = new NotificationService();
    await ntfy.sendAlert("test-topic", "test-message");

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Basic "),
        }),
      })
    );
  });

  it("should NOT include auth header when credentials are absent", async () => {
    const ntfy = new NotificationService();
    await ntfy.sendAlert("test-topic", "test-message");

    const call = vi.mocked(axios.post).mock.calls[0];
    const headers = (call[2] as any).headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it("should not throw when axios POST fails", async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error("Network Error"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ntfy = new NotificationService();

    // Should not throw
    await expect(ntfy.sendAlert("topic", "msg")).resolves.not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to send alert"));
  });

  it("should support action buttons in the alert", async () => {
    const ntfy = new NotificationService();
    const actions = [
      { label: "Approve", url: "https://approve.com" },
      { label: "Deny", type: "http", url: "https://deny.com" },
    ];

    await ntfy.sendAlert("topic", "msg", actions);

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Actions: "view, Approve, https://approve.com; http, Deny, https://deny.com",
        }),
      })
    );
  });

  it("should handle 401 by prompting for auth and retrying", async () => {
    const { loadSecrets, saveSecrets } = await import("../secrets");
    const readline = await import("node:readline");

    const rlMock = {
      question: vi.fn((q, cb) => cb(q.includes("username") ? "newuser" : "newpass")),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(rlMock as any);

    // 1st call fails, 2nd succeeds
    vi.mocked(axios.post)
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: "ok" });

    const ntfy = new NotificationService();
    await ntfy.sendAlert("topic", "msg");

    expect(rlMock.question).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(saveSecrets).toHaveBeenCalledWith(
      expect.objectContaining({
        BANTAY_NTFY_USERNAME: "newuser",
        BANTAY_NTFY_PASSWORD: "newpass",
      })
    );
  });
});
