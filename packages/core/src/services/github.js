"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Service to interact with the GitHub API using tokens from Auth0 Token Vault
 */
class GitHubService {
    /**
     * Checks if a repository is public or private
     * @param repoName repository name (owner/repo)
     * @param authorizer The token vault authorizer from Auth0Service
     * @returns visibility status
     */
    async getRepoVisibility(repoName, authorizer) {
        // When the agent calls this tool, the SDK handles token retrieval
        // through the specific connection ("github") configured in Auth0.
        const response = await axios_1.default.get(`https://api.github.com/repos/${repoName}`, {
            headers: {
                // The authorizer provides the actual token from the vault
                Authorization: `Bearer ${authorizer.token}`,
            },
        });
        return response.data.private ? "private" : "public";
    }
}
exports.GitHubService = GitHubService;
//# sourceMappingURL=github.js.map