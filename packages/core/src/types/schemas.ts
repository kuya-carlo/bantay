import { z } from "zod";

/**
 * Common finding interface for scanners
 */
export interface Finding {
  file: string;
  line_number: number;
  type: string;
  value: string;
}

/**
 * Schema for raw git diff input
 */
export const GitDiffSchema = z.object({
  repoName: z.string(),
  branch: z.string(),
  author: z.string(),
  diff: z.string(),
});

export type GitDiff = z.infer<typeof GitDiffSchema>;

/**
 * Schema for detect-secrets output finding
 */
export const SecretFindingSchema = z.object({
  type: z.string(),
  filename: z.string(),
  hashed_secret: z.string(),
  is_secret: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  line_number: z.number(),
});

export type SecretFinding = z.infer<typeof SecretFindingSchema>;

/**
 * Schema for the full detect-secrets JSON output
 */
export const DetectSecretsOutputSchema = z.object({
  version: z.string(),
  results: z.record(z.array(SecretFindingSchema)),
});

export type DetectSecretsOutput = z.infer<typeof DetectSecretsOutputSchema>;

/**
 * Schema for the consolidated metadata envelope sent to the LLM
 */
export const MetadataEnvelopeSchema = z.object({
  metadata: GitDiffSchema.omit({ diff: true }),
  findings: z.array(SecretFindingSchema),
  context: z.string().optional(), // e.g. commit message or file context
});

export type MetadataEnvelope = z.infer<typeof MetadataEnvelopeSchema>;

/**
 * Schema for the LLM risk assessment output
 */
export const RiskAssessmentSchema = z.object({
  tier: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  suggestion: z.string(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
