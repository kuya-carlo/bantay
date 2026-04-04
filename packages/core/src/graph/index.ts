import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { scan } from "./nodes/scan";
import { scoreRisk } from "./nodes/score";
import { decide } from "./nodes/decide";

/**
 * State definition for the Git Guardian graph
 */
export const GitGuardianState = Annotation.Root({
  // Raw input: git diff
  diff: Annotation<string>(),
  // findings from detect-secrets
  findings: Annotation<any[]>({
     reducer: (x, y) => y ?? x,
     default: () => []
  }),
  findingsRaw: Annotation<any>(),
  // risk assessment from LLM
  riskAssessment: Annotation<any>({
     reducer: (x, y) => y ?? x,
     default: () => null
  }),
  // Human approval result (true = allow, false = block, null = pending)
  approved: Annotation<boolean | null>({
     reducer: (x, y) => (y !== null ? y : x),
     default: () => null
  }),
  // Error state if any
  error: Annotation<string | null>({
     reducer: (x, y) => y ?? x,
     default: () => null
  })
});

/**
 * Builds the Git Guardian state machine
 */
export function buildGraph() {
  const builder = new StateGraph(GitGuardianState)
    .addNode("scan", scan)
    .addNode("score", scoreRisk)
    .addNode("decide", decide)
    .addEdge(START, "scan")
    .addEdge("scan", "score")
    .addEdge("score", "decide")
    .addEdge("decide", END);

  const checkpointer = new MemorySaver();
  return builder.compile({ checkpointer });
}
