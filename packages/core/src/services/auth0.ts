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

  // packages/core/src/services/auth0.ts

  get asyncConfirmation() {
    const userId = process.env.AUTH0_USER_ID || "github|106532351";

    // Wrap the authorizer to force the correct CIBA start
    return async (params: any) => {
      // 1. Manually trigger the CIBA request to force the "Email" channel
      const response = await fetch(`https://${process.env.AUTH0_DOMAIN}/bc-authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },

        body: new URLSearchParams({
          client_id: process.env.AUTH0_CLIENT_ID!,
          client_secret: process.env.AUTH0_CLIENT_SECRET!,
          login_hint: JSON.stringify({
            format: "iss_sub",
            iss: `https://${process.env.AUTH0_DOMAIN}/`,
            sub: userId
          }),
          binding_message: "Bantay: High-risk push detected. Authorize?",
          scope: "openid",
          requested_expiry: "600" // <--- ADD THIS to force Email fallback
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Auth0 CIBA Error: ${error.error_description || error.error}`);
      }

      // 2. Now let the SDK handle the polling/resume logic
      return this.auth0AI.withAsyncAuthorization({
        userID: () => userId,
        bindingMessage: "Bantay: Authorize?",
        scopes: ["openid"],
      })(params);
    };
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
      userID: () => process.env.AUTH0_USER_ID || "default_user",
      bindingMessage: "Bantay: A medium-risk push attempt was detected. Do you authorize this action?",
      scopes: ["openid"],
    }, rawTool);
  }
}
