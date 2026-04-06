import { z } from "zod";

export const FindingSchema = z.object({
  file: z.string(),
  line_number: z.number(),
  type: z.string(),
  value: z.string(),
  riskTier: z.enum(["low", "medium", "high"]),
});

export type Finding = z.infer<typeof FindingSchema>;

export const RiskAssessmentSchema = z.object({
  tier: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  suggestion: z.string(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const ScannerStateSchema = z.object({
  diff: z.string(),
  findings: z.array(FindingSchema).optional(),
  riskAssessment: RiskAssessmentSchema.optional(),
  approved: z.boolean().nullable().optional(),
  secrets: z.record(z.string()).optional(),
});
