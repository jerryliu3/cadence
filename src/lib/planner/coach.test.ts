import { describe, expect, it } from "vitest";
import { coachResponseJsonSchema } from "./coach";

describe("coachResponseJsonSchema", () => {
  it("declares items for Gemini array properties", () => {
    const proposalSchema = coachResponseJsonSchema.properties.proposal;
    if (!proposalSchema || proposalSchema.type !== "object") {
      throw new Error("proposal schema missing");
    }

    expect(proposalSchema.properties.assessments).toEqual({
      type: "array",
      items: { type: "object" },
    });
    expect(proposalSchema.properties.policyPatches).toEqual({
      type: "array",
      items: { type: "object" },
    });
  });
});
