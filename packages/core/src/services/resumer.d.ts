import { type CompiledStateGraph } from "@langchain/langgraph";
/**
 * Service to poll Auth0 for CIBA status and resume the graph
 */
export declare class GraphResumer {
    /**
     * Polls Auth0 for the status of a CIBA request and resumes the graph upon approval/denial
     * @param graph The compiled LangGraph
     * @param config The thread config (including thread_id)
     * @param authReqId The CIBA auth_req_id from Auth0
     */
    pollAndResume(graph: CompiledStateGraph<any, any, any>, config: {
        configurable: {
            thread_id: string;
        };
    }, authReqId: string): Promise<void>;
}
//# sourceMappingURL=resumer.d.ts.map