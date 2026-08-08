import { describe, expect, it } from "vitest";
import { coachResponseJsonSchema } from "./coach";

describe("coachResponseJsonSchema", () => {
  it("declares explicit calendar intent fields for Gemini structured output", () => {
    const proposalSchema = coachResponseJsonSchema.properties.proposal;
    if (!proposalSchema || proposalSchema.type !== "object") {
      throw new Error("proposal schema missing");
    }

    const calendarIntent = proposalSchema.properties.calendarIntent;
    expect(calendarIntent).toMatchObject({
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["none", "needs_goal", "apply"],
        },
        global: {
          type: ["object", "null"],
        },
      },
    });
    expect(proposalSchema.required).toEqual([
      "calendarIntent",
      "unresolvedQuestions",
    ]);
  });
});
