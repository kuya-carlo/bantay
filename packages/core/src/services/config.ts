import fs from "node:fs/promises";
import path from "node:path";
// @ts-ignore
import yaml from "js-yaml";
import { z } from "zod";

/**
 * Schema for .guardian.yaml
 */
export const ConfigSchema = z.object({
  ntfy: z.object({
    topic: z.string().default("mytopic"),
  }).default({ topic: "mytopic" }),
  git: z.object({
    protectedBranches: z.array(z.string()).default(["main", "master"]),
  }).default({ protectedBranches: ["main", "master"] }),
  thresholds: z.object({
    highRiskLineCount: z.number().default(100),
  }).default({ highRiskLineCount: 100 }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Service to load and manage Git Guardian configuration
 */
export class ConfigService {
  private config: Config | null = null;

  /**
   * Loads the configuration from .guardian.yaml
   * @param projectRoot Root directory of the project
   * @returns Loaded configuration
   */
  async load(projectRoot: string): Promise<Config> {
    const configPath = path.join(projectRoot, ".guardian.yaml");
    
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const raw = yaml.load(content);
      this.config = ConfigSchema.parse(raw);
    } catch (error) {
      // If file doesn't exist, use default configuration
      console.warn(`[Config] Using default configuration because .guardian.yaml was not found at ${configPath}.`);
      this.config = ConfigSchema.parse({});
    }

    return this.config;
  }

  /**
   * Returns the currently loaded configuration
   */
  get(): Config {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call load() first.");
    }
    return this.config;
  }
}
