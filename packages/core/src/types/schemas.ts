import { z } from "zod";

export type Finding = {
  file: string;
  line_number: number;
  type: string;
  value: string;
  riskTier?: "high" | "medium" | "low";
};

/**
 * Schema for the LLM risk assessment output
 */
export const RiskAssessmentSchema = z.object({
  tier: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  suggestion: z.string(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
