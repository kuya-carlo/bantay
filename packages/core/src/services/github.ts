import axios from "axios";

/**
 * Fetches repository visibility from GitHub API
 * @param owner Repository owner
 * @param repo Repository name
 * @param githubAccessToken GitHub Access Token (from Auth0 Token Vault)
 * @returns "public" or "private"
 */
export async function getRepoVisibility(
  owner: string,
  repo: string,
  githubAccessToken: string
): Promise<"public" | "private"> {
  try {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });

    if (response.status !== 200) {
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    return response.data.private ? "private" : "public";
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      throw new Error(`GitHub API Error (${status}): ${message}`);
    }
    throw error;
  }
}
