import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { getRepoVisibility } from "../github";

vi.mock("axios");

describe("GitHub Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getRepoVisibility", () => {
    it("should return public when repo.private is false", async () => {
      (axios.get as any).mockResolvedValueOnce({
        status: 200,
        data: {
          private: false,
        },
      });

      const visibility = await getRepoVisibility("owner", "repo", "token");
      expect(visibility).toBe("public");
      expect(axios.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token",
          }),
        })
      );
    });

    it("should return private when repo.private is true", async () => {
      (axios.get as any).mockResolvedValueOnce({
        status: 200,
        data: {
          private: true,
        },
      });

      const visibility = await getRepoVisibility("owner", "repo", "token");
      expect(visibility).toBe("private");
    });

    it("should throw a typed error when axios returns non-200", async () => {
      (axios.get as any).mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        data: { message: "Not Found" },
      });

      await expect(getRepoVisibility("owner", "non-existent", "token")).rejects.toThrow(
        "GitHub API returned status 404"
      );
    });

    it("should throw a detailed error on axios failure", async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { message: "Rate limit exceeded" },
        },
        message: "Request failed with status code 403",
      };
      (axios.get as any).mockRejectedValueOnce(mockError);
      (axios.isAxiosError as any).mockReturnValue(true);

      await expect(getRepoVisibility("owner", "repo", "token")).rejects.toThrow(
        "GitHub API Error (403): Rate limit exceeded"
      );
    });
  });
});
