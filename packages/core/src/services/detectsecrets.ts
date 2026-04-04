import { spawn } from "node:child_process";
import { DetectSecretsOutputSchema, type DetectSecretsOutput, type SecretFinding } from "../types/schemas.js";

/**
 * Wrapper for the detect-secrets CLI tool (via uv run)
 */
export class DetectSecretsService {
  /**
   * Scans a directory or file using detect-secrets
   * @param targetPath Path to scan
   * @returns List of findings
   */
  async scan(targetPath: string): Promise<SecretFinding[]> {
    return new Promise((resolve, reject) => {
      // Use 'uv run' to ensure the correct python environment
      const child = spawn("uv", ["run", "detect-secrets", "scan", targetPath, "--json"]);
      
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        // detect-secrets might return non-zero if secrets are found, 
        // but we want to parse the JSON regardless if it finished successfully.
        try {
          if (!stdout && code !== 0) {
            return reject(new Error(`detect-secrets failed with code ${code}: ${stderr}`));
          }

          const rawOutput = JSON.parse(stdout);
          const parsed = DetectSecretsOutputSchema.parse(rawOutput);
          
          // Flatten results object into a single array
          const findings: SecretFinding[] = Object.values(parsed.results).flat();
          resolve(findings);
        } catch (error) {
          reject(new Error(`Failed to parse detect-secrets output: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to start detect-secrets: ${error.message}`));
      });
    });
  }
}
