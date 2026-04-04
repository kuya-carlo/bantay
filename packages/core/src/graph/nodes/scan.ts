import { DetectSecretsService } from "../../services/detectsecrets";

const scanner = new DetectSecretsService();

/**
 * node to run detect-secrets on the provided diff
 */
export async function scan(state: any) {
  const { diff } = state;

  if (!diff) {
    return { findings: [], findingsRaw: null };
  }

  try {
    const findings = await scanner.scanDiff(diff);
    return {
      findings: findings,
      findingsRaw: findings // We keep a raw copy for the LLM
    };
  } catch (error) {
    console.error(`[scan] Error during secret scanning: ${error instanceof Error ? error.message : String(error)}`);
    // Fail-Closed: Return high-risk marker if scanner fails
    return {
       error: "Secret scanner failed",
       findings: [{ type: "InternalError", line: 0 }]
    };
  }
}
