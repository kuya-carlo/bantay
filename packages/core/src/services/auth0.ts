import { Auth0AI } from "@auth0/ai-langchain";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Service to manage Auth0 AI SDK integrations
 */
export class Auth0Service {
  private auth0AI: Auth0AI;

  private notificationService?: any;
  private ntfyTopic?: string;

  constructor(config: {
    domain: string;
    clientId: string;
    clientSecret: string;
    notificationService?: any;
    ntfyTopic?: string;
  }) {
    this.notificationService = config.notificationService;
    this.ntfyTopic = config.ntfyTopic;
    this.auth0AI = new Auth0AI({
      auth0: {
        domain: config.domain,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
    });
  }

  /**
   * Authorizer for asynchronous user confirmation (CIBA)
   */
  get asyncConfirmation() {
    return this.auth0AI.withAsyncAuthorization({
      // @ts-ignore
      userID: (_params: any, config: any) => config.configurable?.user_id || "default_user",
      bindingMessage: "Git Guardian: A medium-risk push attempt was detected. Do you authorize this action?",
      scopes: ["openid"],
      onAuthorizationInterrupt: async (interrupt: any, context: any) => {
         if (this.notificationService && this.ntfyTopic) {
             const threadID = (context as any).configurable?.thread_id;
             const message = `🛡️ Push Interrupted! Guardian detected a MEDIUM risk secret.\nApproval requested for thread: ${threadID || 'unknown'}`;
             await this.notificationService.sendAlert(this.ntfyTopic, message);
         }
      }
    });
  }

  /**
   * Token Vault authorizer for GitHub API
   */
  get githubAuthorizer() {
    return this.auth0AI.withTokenVault({
      connection: "github",
      scopes: ["repo"],
    });
  }

  /**
   * Creates the "allow-push" tool wrapped in CIBA confirmation
   */
  createAllowPushTool(): any {
    // @ts-ignore
    const rawTool = tool(
      async ({ reason }: { reason: string }) => {
        console.log(`[Tool] Push allowed. Reason: ${reason}`);
        return { status: "allowed", reason };
      },
      {
        name: "allow_push",
        description: "Allows the git push to proceed after validation.",
        schema: z.object({
          reason: z.string().describe("The reason for allowing the push"),
        }),
      }
    );

    return this.auth0AI.withAsyncAuthorization({
       // @ts-ignore
       userID: (_params: any, config: any) => config.configurable?.user_id || "default_user",
       bindingMessage: "Git Guardian: A medium-risk push attempt was detected. Do you authorize this action?",
       scopes: ["openid"],
       onAuthorizationInterrupt: async (interrupt: any, context: any) => {
          if (this.notificationService && this.ntfyTopic) {
              const threadID = (context as any).configurable?.thread_id;
              const message = `🛡️ Push Interrupted! Guardian detected a MEDIUM risk secret.\nApproval requested for thread: ${threadID || 'unknown'}`;
              await this.notificationService.sendAlert(this.ntfyTopic, message);
          }
       }
    }, rawTool);
  }
}
