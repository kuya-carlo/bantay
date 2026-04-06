import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreRisk } from "../src/graph/nodes/score";
import axios from "axios";

vi.mock("axios");
vi.mock("../src/services/secrets", () => ({
  loadSecrets: vi.fn().mockResolvedValue({ BANTAY_LLM_API_KEY: "fake-key" }),
}));

describe("scoreRisk node", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BANTAY_LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.BANTAY_LLM_MODEL = "gpt-4-turbo";
  });

  it("should return low risk if no findings", async () => {
    const state = { findings: [] };
    const result = await scoreRisk(state);
    expect(result.tier).toBe("low");
  });

  it("should call LLM and return parsed risk assessment", async () => {
    const state = {
      findings: [{ type: "API Key", file: "index.js", line_number: 1, value: "sk-***" }],
    };

    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                tier: "high",
                reason: "Found Anthropic API Key",
                suggestion: "Revoke and rotate",
              }),
            },
          },
        ],
      },
    };

    (axios.post as any).mockResolvedValue(mockResponse);

    const result = await scoreRisk(state);
    expect(result.tier).toBe("high");
    expect(result.reason).toContain("Found Anthropic API Key");
  });

  it("should fail-closed to high risk if LLM call fails", async () => {
    const state = { findings: [{ type: "Secret" }] };
    (axios.post as any).mockRejectedValue(new Error("Network Error"));

    const result = await scoreRisk(state);
    expect(result.tier).toBe("high");
    expect(result.reason).toContain("Risk assessment failed");
  });
});
