import axios from "axios";
import { RiskAssessmentSchema } from "../../types/schemas";

/**
 * node to score the risk of detected secrets using an OpenAI-compatible LLM
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

  // Provider-agnostic LLM config
  const baseURL = process.env.LLM_BASE_URL || "https://api.vultrinference.com/v1";
  const apiKey = process.env.LLM_API_KEY || process.env.VULTR_API_KEY;
  const model = process.env.LLM_MODEL || "Qwen/Qwen2.5-Coder-32B-Instruct";

  try {
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a security expert. Analyze the following secret detection findings from a git diff and assess the risk level.

Findings (values are masked for security, but the TYPE is what matters):
${JSON.stringify(findingsRaw, null, 2)}

IMPORTANT: A masked or truncated value still represents a REAL secret.

Respond ONLY with a JSON object:
- tier: "low" | "medium" | "high"
- reason: short explanation
- suggestion: how to fix it

Criteria:
- HIGH: Any finding with type containing "API Key", "Token", "Secret", "Password", "Credential", "Private Key", AWS/GitHub/OpenAI/Anthropic/Stripe patterns. AUTO-BLOCK.
- MEDIUM: JWT tokens, high-entropy strings, source map files, unknown patterns. Requires HUMAN AUTHORIZATION.
- LOW: Only if findings array is empty or contains only false positives explicitly labeled as such.

When in doubt, score HIGH. Return only the JSON.`
          }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const content = response.data.choices[0].message.content;
    // Extract JSON if wrapped in markdown
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const assessment = JSON.parse(jsonStr);
    assessment.tier = assessment.tier.trim().toLowerCase();

    return RiskAssessmentSchema.parse(assessment);
  } catch (error: any) {
    console.error(`[LLM] Error scoring risk: ${error.message}`);
    // Fail-Closed: High risk if LLM fails (Policy C/A)
    return {
      tier: "high",
      reason: "Risk assessment failed. Defaulting to high risk per safety policy.",
      suggestion: "Manually review findings before pushing."
    };
  }
}
