import { ChatOpenAI } from "@langchain/openai";
import { RiskAssessmentSchema } from "../../types/schemas";

/**
 * node to score the risk of detected secrets using Vultr Inference (Llama 3.3 70B)
 */
export async function scoreRisk(state: any) {
  const { findings, findingsRaw } = state;

  if (!findings || findings.length === 0) {
    return {
      riskAssessment: {
        tier: "low",
        reason: "No secrets detected in the diff.",
        suggestion: "Safe to push."
      }
    };
  }

  const model = new ChatOpenAI({
    modelName: "qwen2.5-coder-32b-instruct",
    apiKey: process.env.VULTR_API_KEY,
    configuration: {
      baseURL: "https://api.vultrinference.com/v1",
    }
  });

  const prompt = `You are a security expert. Analyze the following secret detection findings and categorize the risk.
Findings:
${JSON.stringify(findingsRaw, null, 2)}

Respond ONLY with a JSON object containing:
- tier: "low" | "medium" | "high"
- reason: short explanation
- suggestion: how to fix it

Criteria:
- HIGH: Raw production API keys (Stripe, AWS, OpenAI, Auth0) or Database credentials. Pushes will be BLOCKED automatically.
- MEDIUM: Generic secrets, high-entropy strings, or test environment keys. Pushes will require HUMAN AUTHORIZATION via Auth0 CIBA.
- LOW: Public keys, known false positives, or masked tokens. Pushes are ALLOWED.

Return only the JSON.`;

  try {
    const response = await model.invoke(prompt);
    
    // Parse the JSON from the LLM response
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    // Extract JSON if wrapped in markdown
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const assessment = JSON.parse(jsonStr);
    
    return {
      riskAssessment: RiskAssessmentSchema.parse(assessment)
    };
  } catch (error) {
    console.error(`[LLM] Error scoring risk: ${error instanceof Error ? error.message : String(error)}`);
    // Fail-Closed: High risk if LLM fails (Policy C/A)
    return {
      riskAssessment: {
        tier: "high",
        reason: "Risk assessment failed (LLM unreachable). Defaulting to high risk per safety policy.",
        suggestion: "Manually review findings in .bantay/reports."
      }
    };
  }
}
