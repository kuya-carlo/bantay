export async function decide(state: any) {
  const { riskAssessment, approved } = state;
  const hasSensitiveFile = state.findings?.some((f: any) => f.type === "Sensitive Filename");
  if (hasSensitiveFile && riskAssessment.tier === "low") {
    return { approved: null }; // Force MEDIUM
  }
  if (riskAssessment.tier === "low") return { approved: true };
  if (riskAssessment.tier === "high") return { approved: false };
  // MEDIUM — return null, CIBA handled in CLI
  return { approved: null };
}
