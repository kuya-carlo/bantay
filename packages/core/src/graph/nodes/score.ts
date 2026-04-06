import axios from "axios";
import { loadSecrets } from "../../services/secrets";
import { RiskAssessmentSchema } from "../../types/schemas";

/**
 * Resolves the LLM API key from env or encrypted secrets
 */
async function resolveLlmKey(providedSecrets?: Record<string, string>): Promise<string> {
  if (process.env.BANTAY_LLM_API_KEY) return process.env.BANTAY_LLM_API_KEY;
  if (providedSecrets?.BANTAY_LLM_API_KEY) return providedSecrets.BANTAY_LLM_API_KEY;
  const secrets = await loadSecrets();
  if (secrets.BANTAY_LLM_API_KEY) return secrets.BANTAY_LLM_API_KEY;
  throw new Error("Not authenticated. Run 'bantay login' first. (Missing BANTAY_LLM_API_KEY)");
}

/**
 * Node that scores the total risk of the findings using an OpenAI-compatible LLM
 */
export async function scoreRisk(state: any): Promise<any> {
  const { findings, secrets } = state;

  if (!findings || findings.length === 0) {
    return {
      tier: "low",
      reason: "No secrets detected in the diff.",
      suggestion: "Safe to push.",
    };
  }

  const apiKey = await resolveLlmKey(secrets);
  const baseUrl = process.env.BANTAY_LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.BANTAY_LLM_MODEL || "gpt-4-turbo";

  const prompt = `
    You are a security expert. Analyze the following secret detection findings from a git diff and assess the risk level.

    Findings (values are masked for security, but the TYPE is what matters):
    ${JSON.stringify(findings, null, 2)}
    
    IMPORTANT: A masked or truncated value still represents a REAL secret.
    
    Respond ONLY with a JSON object:
    - tier: "low" | "medium" | "high"
    - reason: short explanation
    - suggestion: how to fix it
  `;

  try {
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response.data.choices[0].message.content;
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const risk = RiskAssessmentSchema.parse(JSON.parse(jsonStr));
    return risk;
  } catch (error: any) {
    console.error(
      `[Score] LLM check failed: ${error.message}. Defaulting to HIGH risk for safety.`
    );
    return {
      tier: "high",
      reason: `Risk assessment failed: ${error.message}`,
      suggestion: "Manually review the findings before pushing.",
    };
  }
}
