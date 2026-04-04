import { interrupt } from "@langchain/langgraph";

/**
 * node to decide whether to allow, block, or interrupt for human approval
 */
export async function decide(state: any) {
  const { riskAssessment, approved } = state;

  if (riskAssessment.tier === "low") {
    return { approved: true };
  }

  if (riskAssessment.tier === "high") {
    // blocked by policy
    return { approved: false };
  }

  // MEDIUM: requires human confirmation
  if (approved === null) {
      // 1. Notify out-of-band (via ntfy - this is handled in a separate node or here)
      // For MVP, we interrupt here. The NotificationService should be called before or during this.
      console.log(`[decide] MEDIUM risk detected. Triggering Human-in-the-Loop approval.`);
      
      // The actual interrupt
      const response = interrupt({
         message: "Bantay detected a MEDIUM risk secret. Do you authorize this push?",
         assessment: riskAssessment
      });

      // When resumed (after CIBA), assessment result is stored in state
      return { approved: response };
  }

  return state;
}
