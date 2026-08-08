import { describe, expect, it } from "vitest";
import { coachResponseJsonSchema } from "./coach";

function assertNoArrayValuedType(value: unknown) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (
    "type" in value &&
    Array.isArray((value as { type?: unknown }).type)
  ) {
    throw new Error("Gemini response schema cannot use array-valued `type`.");
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      assertNoArrayValuedType(entry);
    }
    return;
  }

  for (const nested of Object.values(value)) {
    assertNoArrayValuedType(nested);
  }
}

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
          type: "object",
          nullable: true,
        },
      },
    });
    expect(proposalSchema.required).toEqual([
      "calendarIntent",
      "unresolvedQuestions",
    ]);
  });

  it("avoids array-valued `type` fields incompatible with Gemini schema validation", () => {
    expect(() => assertNoArrayValuedType(coachResponseJsonSchema)).not.toThrow();
  });
});
