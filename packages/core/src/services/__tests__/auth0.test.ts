import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { getManagementToken, getGithubToken, resetTokenCache } from "../auth0";

vi.mock("axios");

describe("Auth0 Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTokenCache();
    process.env.BANTAY_AUTH0_DOMAIN = "kuyacarlo.jp.auth0.com";
    process.env.BANTAY_AUTH0_CLIENT_ID = "test-id";
    process.env.BANTAY_AUTH0_CLIENT_SECRET = "test-secret";
  });

  describe("getManagementToken", () => {
    it("should fetch and return a management token", async () => {
      const mockToken = "mock-access-token";
      (axios.post as any).mockResolvedValueOnce({
        data: {
          access_token: mockToken,
          expires_in: 3600,
        },
      });

      const token = await getManagementToken();
      expect(token).toBe(mockToken);
      expect(axios.post).toHaveBeenCalledWith(
        "https://kuyacarlo.jp.auth0.com/oauth/token",
        expect.objectContaining({
          grant_type: "client_credentials",
        })
      );
    });

    it("should reuse cached token on subsequent calls", async () => {
      const mockToken = "cached-token";
      (axios.post as any).mockResolvedValueOnce({
        data: {
          access_token: mockToken,
          expires_in: 3600,
        },
      });

      // Resetting module-level variables is tricky in ESM,
      // but in a fresh vitest run or with a specific reset, it works.
      const token1 = await getManagementToken();
      const token2 = await getManagementToken();

      expect(token1).toBe(mockToken);
      expect(token2).toBe(mockToken);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe("getGithubToken", () => {
    it("should return github access_token from user identities", async () => {
      const mockMgmtToken = "mgmt-token";
      const mockGithubToken = "gh-12345";

      // Mock management token
      (axios.post as any).mockResolvedValueOnce({
        data: { access_token: mockMgmtToken, expires_in: 3600 },
      });

      // Mock user response
      (axios.get as any).mockResolvedValueOnce({
        data: {
          identities: [
            { provider: "google-oauth2", access_token: "google-token" },
            { provider: "github", access_token: mockGithubToken },
          ],
        },
      });

      const token = await getGithubToken("auth0|userid");
      expect(token).toBe(mockGithubToken);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("auth0%7Cuserid"),
        expect.objectContaining({
          headers: { Authorization: `Bearer ${mockMgmtToken}` },
        })
      );
    });

    it("should throw error if no github identity is found", async () => {
      // Mock management token because cache was reset
      (axios.post as any).mockResolvedValueOnce({
        data: { access_token: "mgmt-token", expires_in: 3600 },
      });

      (axios.get as any).mockResolvedValueOnce({
        data: {
          identities: [{ provider: "google-oauth2", access_token: "google-token" }],
        },
      });

      await expect(getGithubToken("auth0|userid")).rejects.toThrow(
        "No GitHub access token found for user auth0|userid"
      );
    });
  });
});
