import { describe, it, expect } from "vitest";
import { decide } from "../src/graph/nodes/decide";

describe("decide node", () => {
  it("should approve low risk assessment", async () => {
    const state = { riskAssessment: { tier: "low" } };
    const result = await decide(state);
    expect(result.approved).toBe(true);
  });

  it("should block high risk assessment", async () => {
    const state = { riskAssessment: { tier: "high" } };
    const result = await decide(state);
    expect(result.approved).toBe(false);
  });

  it("should interrupt on medium risk for human authorization", async () => {
    const state = { riskAssessment: { tier: "medium" } };
    const result = await decide(state);
    expect(result.approved).toBeNull();
  });
});
