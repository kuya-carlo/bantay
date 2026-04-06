import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
// @ts-ignore
import yaml from "js-yaml";

export interface BantayConfig {
  ntfy: {
    topic: string;
    url?: string;
    username?: string;
    password?: string;
  };
  git: {
    protectedBranches: string[];
  };
  scan: {
    blockOnTimeout: boolean;
    cibaTimeoutSeconds: number;
    sensitiveFiles: string[];
    sourceMaps: {
      publicRepo: "high" | "medium" | "low";
      privateRepo: "high" | "medium" | "low";
    };
  };
  thresholds: {
    chungusLineCount: number;
  };
}

const DEFAULTS: BantayConfig = {
  ntfy: {
    topic: "bantay",
  },
  git: {
    protectedBranches: ["main", "master", "prod"],
  },
  scan: {
    blockOnTimeout: true,
    cibaTimeoutSeconds: 60,
    sensitiveFiles: [
      "*.pem",
      "*.key",
      "id_rsa",
      ".env",
      "credentials.json",
      "*.pfx",
      "*.p12",
      "*.map",
    ],
    sourceMaps: {
      publicRepo: "high",
      privateRepo: "medium",
    },
  },
  thresholds: {
    chungusLineCount: 1000,
  },
};

/**
 * Service to load and manage Bantay configuration
 */
export class ConfigService {
  private config: BantayConfig | null = null;

  /**
   * Loads the configuration from ~/.bantay/config and .bantay.yaml
   */
  async load(projectRoot: string): Promise<BantayConfig> {
    const globalConfigPath = path.join(os.homedir(), ".bantay", "config");
    const repoConfigPath = path.join(projectRoot, ".bantay.yaml");

    let globalConfigRaw: any = {};
    let repoConfig: any = {};

    // 1. Load global config
    try {
      const content = await fs.readFile(globalConfigPath, "utf-8");
      globalConfigRaw = JSON.parse(content);
    } catch (e) {
      // Ignore if global config missing
    }

    // Resolve active tenant config
    const activeTenantName = globalConfigRaw.activeTenant || "default";
    const tenants = globalConfigRaw.tenants || {};
    const globalConfig = tenants[activeTenantName] || globalConfigRaw; // Fallback for legacy format

    // 2. Load repo config
    try {
      const content = await fs.readFile(repoConfigPath, "utf-8");
      repoConfig = yaml.load(content) || {};
    } catch (e) {
      // Ignore if repo config missing
    }

    // 3. Merge components
    this.config = {
      ntfy: {
        ...DEFAULTS.ntfy,
        topic: repoConfig.ntfy?.topic || globalConfig.ntfyTopic || DEFAULTS.ntfy.topic,
        url: repoConfig.ntfy?.url || globalConfig.ntfyUrl || process.env.BANTAY_NTFY_URL,
        username: process.env.BANTAY_NTFY_USERNAME,
        password: process.env.BANTAY_NTFY_PASSWORD,
      },
      git: {
        ...DEFAULTS.git,
        ...(repoConfig.git || {}),
      },
      scan: {
        ...DEFAULTS.scan,
        ...(repoConfig.scan || {}),
        sourceMaps: {
          ...DEFAULTS.scan.sourceMaps,
          ...(repoConfig.scan?.sourceMaps || {}),
        },
      },
      thresholds: {
        ...DEFAULTS.thresholds,
        ...(repoConfig.thresholds || {}),
      },
    };

    return this.config;
  }

  /**
   * Returns the currently loaded configuration
   */
  get(): BantayConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call load() first.");
    }
    return this.config;
  }
}
