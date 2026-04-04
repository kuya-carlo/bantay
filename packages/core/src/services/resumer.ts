import { type CompiledStateGraph, Command } from "@langchain/langgraph";
import axios from "axios";

/**
 * Service to poll Auth0 for CIBA status and resume the graph
 */
export class GraphResumer {
  /**
   * Polls Auth0 for the status of a CIBA request and resumes the graph upon approval/denial
   * @param graph The compiled LangGraph
   * @param config The thread config (including thread_id)
   * @param authReqId The CIBA auth_req_id from Auth0
   */
  async pollAndResume(
    graph: CompiledStateGraph<any, any, any>,
    config: { configurable: { thread_id: string } },
    authReqId: string
  ) {
    console.log(`[Resumer] Starting poll for CIBA request: ${authReqId}`);
    
    // Polling logic (simplified for MVP)
    // In a real scenario, this would be a background process or triggered by a webhook
    let status = "pending";
    const maxAttempts = 30; // 30s total if 1s interval
    let attempts = 0;

    while (status === "pending" && attempts < maxAttempts) {
      // Mocked status check - in Phase 3 we will implement the actual Auth0 API call
      // For now, we assume it's pending until marked resolved in the integration test
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
      
      // In production, you'd call Auth0's /oauth/token with grant_type: urn:ietf:params:oauth:grant-type:ciba
    }

    if (status === "approved") {
      await graph.invoke(new Command({ resume: { approved: true } }), config);
    } else {
      await graph.invoke(new Command({ resume: { approved: false } }), config);
    }
  }
}
