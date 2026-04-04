import { describe, it, expect } from "vitest";
import { StateGraph, START, END, Command, Annotation, interrupt } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

const TestState = Annotation.Root({
  approved: Annotation<boolean | null>({
    reducer: (x, y) => (y !== null ? y : x),
    default: () => null,
  })
});

describe("CIBA Interrupt and Resume Cycle", () => {
  it("should trigger an interrupt and resume with approved=true", async () => {
    // Define a Test Graph with an interrupt
    const builder = new StateGraph(TestState)
    .addNode("check", (state) => {
       if (state.approved === null) {
          // Formal interrupt in LangGraph 0.2+
          const response = interrupt("Please approve the push");
          // When resumed, 'response' will contain the value passed to Command({ resume: ... })
          return { approved: response };
       }
       return state;
    })
    .addEdge(START, "check")
    .addEdge("check", END);

    const checkpointer = new MemorySaver();
    const graph = builder.compile({ checkpointer });
    const config = { configurable: { thread_id: "test-thread" } };

    // 1. Initial run: should interrupt at 'check'
    await graph.invoke({ approved: null }, config);
    
    let state = await graph.getState(config);
    expect(state.next).toContain("check");
    // @ts-ignore
    expect(state.tasks[0].interrupts[0].value).toBe("Please approve the push");

    // 2. Resume the graph with approved=true
    const result = await graph.invoke(
       new Command({ resume: true }),
       config
    );

    // After resume, the node finishes and updates the state
    const finalState = await graph.getState(config);
    expect(finalState.values.approved).toBe(true);
  });
});
