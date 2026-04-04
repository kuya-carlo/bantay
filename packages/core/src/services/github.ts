import axios from "axios";

/**
 * Service to interact with the GitHub API using tokens from Auth0 Token Vault
 */
export class GitHubService {
  /**
   * Checks if a repository is public or private
   * @param repoName repository name (owner/repo)
   * @param authorizer The token vault authorizer from Auth0Service
   * @returns visibility status
   */
  async getRepoVisibility(repoName: string, authorizer: any): Promise<string> {
    // When the agent calls this tool, the SDK handles token retrieval
    // through the specific connection ("github") configured in Auth0.
    const response = await axios.get(`https://api.github.com/repos/${repoName}`, {
      headers: {
        // The authorizer provides the actual token from the vault
        Authorization: `Bearer ${authorizer.token}`,
      },
    });

    return response.data.private ? "private" : "public";
  }
}
