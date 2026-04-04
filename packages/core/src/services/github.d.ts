/**
 * Service to interact with the GitHub API using tokens from Auth0 Token Vault
 */
export declare class GitHubService {
    /**
     * Checks if a repository is public or private
     * @param repoName repository name (owner/repo)
     * @param authorizer The token vault authorizer from Auth0Service
     * @returns visibility status
     */
    getRepoVisibility(repoName: string, authorizer: any): Promise<string>;
}
//# sourceMappingURL=github.d.ts.map