import { ChatOpenAI } from "@langchain/openai";
import { RiskAssessmentSchema } from "../../types/schemas";

/**
 * node to score the risk of detected secrets using Vultr Inference (Llama 3.3 70B)
 */
export async function scoreRisk(state: any) {
  const { findings } = state;
  const findingsRaw = findings;

  if (!findings || findings.length === 0) {
    return {
      tier: "low",
      reason: "No secrets detected in the diff.",
      suggestion: "Safe to push."
    };
  }

  const model = new ChatOpenAI({
    modelName: "Qwen/Qwen2.5-Coder-32B-Instruct",
    apiKey: process.env.VULTR_API_KEY,
    maxTokens: 1024,
    configuration: {
      baseURL: "https://api.vultrinference.com/v1",
    }
  });

  const prompt = `You are a security expert. Analyze the following secret detection findings from a git diff and assess the risk level.

Findings (values are masked for security, but the TYPE is what matters for risk assessment):
${JSON.stringify(findings, null, 2)}

IMPORTANT: A masked or truncated value (e.g. "sk-ant-***") still represents a REAL secret. Masking is for display only.

Respond ONLY with a JSON object:
- tier: "low" | "medium" | "high"
- reason: short explanation
- suggestion: how to fix it

Criteria (apply strictly):
- HIGH: Raw production API keys — Anthropic, OpenAI, AWS (AKIA...), Stripe, GitHub PAT (ghp_), Slack tokens (xox...), Google API keys (AIza...). These are ALWAYS auto-blocked.
- MEDIUM: JWT tokens, high-entropy strings, unknown patterns, source map files, anything ambiguous. These require HUMAN AUTHORIZATION via Auth0 CIBA.
- LOW: Only if findings array is empty, or contains only public keys or test data explicitly labeled as such.

When in doubt between HIGH and MEDIUM, choose MEDIUM to allow human judgment.
Return only the JSON.`;

  try {
    const response = await model.invoke(prompt);

    // Parse the JSON from the LLM response
    const content: string = typeof (response.content as any) === "string"
      ? (response.content as any)
      : JSON.stringify(response.content);

    // Extract JSON if wrapped in markdown
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const assessment = JSON.parse(jsonStr);
    assessment.tier = assessment.tier.trim().toLowerCase();

    return RiskAssessmentSchema.parse(assessment);
  } catch (error: any) {
    console.error(`[LLM] Error scoring risk: ${error instanceof Error ? error.message : String(error)}`);
    // Fail-Closed: High risk if LLM fails (Policy C/A)
    return {
      tier: "high",
      reason: "Risk assessment failed (LLM unreachable). Defaulting to high risk per safety policy.",
      suggestion: "Manually review findings in .bantay/reports."
    };
  }
}
