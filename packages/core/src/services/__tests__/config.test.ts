import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import yaml from "js-yaml";
import { ConfigService } from "../config";

vi.mock("node:fs/promises");
vi.mock("js-yaml");

describe("ConfigService", () => {
  const projectRoot = "/mock/project";
  let service: ConfigService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ConfigService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return full default config when no config files exist", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(yaml.load).mockReturnValue({});

    const config = await service.load(projectRoot);

    expect(config.ntfy.topic).toBe("bantay");
    expect(config.git.protectedBranches).toContain("main");
    expect(config.scan.blockOnTimeout).toBe(true);
    expect(config.thresholds.chungusLineCount).toBe(1000);
  });

  it("should merge global config with repo-level config", async () => {
    // Global: only ntfyTopic
    vi.mocked(fs.readFile).mockImplementation(async (path: any) => {
      if (path.toString().includes(".bantay/config")) {
        return JSON.stringify({ ntfyTopic: "global-topic" });
      }
      if (path.toString().includes(".bantay.yaml")) {
        return "git:\n  protectedBranches: [release]";
      }
      throw new Error("ENOENT");
    });

    // Repo: only git protectedBranches
    vi.mocked(yaml.load).mockReturnValue({
      git: { protectedBranches: ["release"] },
    });

    const config = await service.load(projectRoot);

    expect(config.ntfy.topic).toBe("global-topic");
    expect(config.git.protectedBranches).toEqual(["release"]);
  });

  it("should prioritize repo-level values over global values", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (path: any) => {
      if (path.toString().includes(".bantay/config")) {
        return JSON.stringify({ ntfyTopic: "global-topic" });
      }
      return "repo-content";
    });

    vi.mocked(yaml.load).mockReturnValue({
      ntfy: { topic: "repo-topic" },
    });

    const config = await service.load(projectRoot);

    expect(config.ntfy.topic).toBe("repo-topic");
  });

  it("should read ntfy credentials from environment variables", async () => {
    vi.stubEnv("BANTAY_NTFY_URL", "https://ntfy.sh/custom");
    vi.stubEnv("BANTAY_NTFY_USERNAME", "user");
    vi.stubEnv("BANTAY_NTFY_PASSWORD", "pass");

    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const config = await service.load(projectRoot);

    expect(config.ntfy.url).toBe("https://ntfy.sh/custom");
    expect(config.ntfy.username).toBe("user");
    expect(config.ntfy.password).toBe("pass");
  });

  it("should handle corrupt .bantay.yaml gracefully", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("corrupt: yaml: {");
    vi.mocked(yaml.load).mockImplementation(() => {
      throw new Error("YAML Parse Error");
    });

    // Should not throw, should return defaults
    const config = await service.load(projectRoot);
    expect(config.ntfy.topic).toBe("bantay");
  });

  it("should handle missing global config gracefully", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (path: any) => {
      if (path.toString().includes(".bantay/config")) {
        throw new Error("ENOENT");
      }
      return "repo-content";
    });
    vi.mocked(yaml.load).mockReturnValue({ ntfy: { topic: "repo-topic" } });

    const config = await service.load(projectRoot);
    expect(config.ntfy.topic).toBe("repo-topic");
  });

  it("should support multi-tenant activeTenant logic", async () => {
    const globalConfig = {
      activeTenant: "work",
      tenants: {
        work: {
          ntfyTopic: "work-topic",
          auth0Domain: "work.auth0.com",
        },
        personal: {
          ntfyTopic: "personal-topic",
        },
      },
    };

    vi.mocked(fs.readFile).mockImplementation(async (path: any) => {
      if (path.toString().includes(".bantay/config")) {
        return JSON.stringify(globalConfig);
      }
      throw new Error("ENOENT");
    });

    const config = await service.load(projectRoot);
    expect(config.ntfy.topic).toBe("work-topic");
  });
});
