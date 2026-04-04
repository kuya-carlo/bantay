"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskAssessmentSchema = exports.MetadataEnvelopeSchema = exports.DetectSecretsOutputSchema = exports.SecretFindingSchema = exports.GitDiffSchema = void 0;
const zod_1 = require("zod");
/**
 * Schema for raw git diff input
 */
exports.GitDiffSchema = zod_1.z.object({
    repoName: zod_1.z.string(),
    branch: zod_1.z.string(),
    author: zod_1.z.string(),
    diff: zod_1.z.string(),
});
/**
 * Schema for detect-secrets output finding
 */
exports.SecretFindingSchema = zod_1.z.object({
    type: zod_1.z.string(),
    filename: zod_1.z.string(),
    hashed_secret: zod_1.z.string(),
    is_secret: zod_1.z.boolean().optional(),
    is_verified: zod_1.z.boolean().optional(),
    line_number: zod_1.z.number(),
});
/**
 * Schema for the full detect-secrets JSON output
 */
exports.DetectSecretsOutputSchema = zod_1.z.object({
    version: zod_1.z.string(),
    results: zod_1.z.record(zod_1.z.array(exports.SecretFindingSchema)),
});
/**
 * Schema for the consolidated metadata envelope sent to the LLM
 */
exports.MetadataEnvelopeSchema = zod_1.z.object({
    metadata: exports.GitDiffSchema.omit({ diff: true }),
    findings: zod_1.z.array(exports.SecretFindingSchema),
    context: zod_1.z.string().optional(), // e.g. commit message or file context
});
/**
 * Schema for the LLM risk assessment output
 */
exports.RiskAssessmentSchema = zod_1.z.object({
    riskTier: zod_1.z.enum(["low", "medium", "high"]),
    reason: zod_1.z.string(),
    suggestion: zod_1.z.string(),
});
//# sourceMappingURL=schemas.js.map