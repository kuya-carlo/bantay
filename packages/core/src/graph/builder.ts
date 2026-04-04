import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { GitDiffSchema, SecretFindingSchema, RiskAssessmentSchema } from "../types/schemas";
import { z } from "zod";

/**
 * State definition for the Bantay Graph
 */
export const BantayState = Annotation.Root({
  // Metadata about the scan
  metadata: Annotation<z.infer<typeof GitDiffSchema>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  
  // Findings from detect-secrets
  findings: Annotation<z.infer<typeof SecretFindingSchema>[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
  
  // Risk assessment from LLM
  assessment: Annotation<z.infer<typeof RiskAssessmentSchema>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  
  // Final decision
  decision: Annotation<"ALLOW" | "BLOCK" | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  })
});

/**
 * Node: Extract Metadata
 */
async function extractMetadata(state: typeof BantayState.State) {
  console.log("[Node] Extracting metadata...");
  // Stub: Logic to be implemented in Phase 3
  return { metadata: state.metadata };
}

/**
 * Node: Run Detect Secrets
 */
async function runScan(state: typeof BantayState.State) {
  console.log("[Node] Running detect-secrets...");
  // Stub: Logic to be implemented in Phase 3
  return { findings: [] };
}

/**
 * Node: Risk Scoring
 */
async function scoreRisk(state: typeof BantayState.State) {
  console.log("[Node] Scoring risk...");
  // Stub: Logic to be implemented in Phase 3
  return { assessment: { riskTier: "low", reason: "Stub", suggestion: "None" } };
}

/**
 * Node: Final Decision
 */
async function decide(state: typeof BantayState.State) {
  console.log("[Node] Making final decision...");
  // Stub: Logic to be implemented in Phase 3
  return { decision: "ALLOW" };
}

/**
 * Build and compile the graph
 */
export function createBantayGraph() {
  const builder = new StateGraph(BantayState)
    .addNode("extract_metadata", extractMetadata)
    .addNode("run_scan", runScan)
    .addNode("score_risk", scoreRisk)
    .addNode("decide", decide)
    .addEdge(START, "extract_metadata")
    .addEdge("extract_metadata", "run_scan")
    .addEdge("run_scan", "score_risk")
    .addEdge("score_risk", "decide")
    .addEdge("decide", END);

  return builder.compile();
}
