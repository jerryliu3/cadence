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

  it("avoids schema keywords rejected by Gemini structured-output validation", () => {
    const forbiddenKeywords = new Set([
      "additionalProperties",
      "nullable",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "minimum",
      "maximum",
    ]);
    const failures: string[] = [];

    const visit = (value: unknown, path: string) => {
      if (!value || typeof value !== "object") {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
        return;
      }
      for (const [key, nested] of Object.entries(value)) {
        if (forbiddenKeywords.has(key)) {
          failures.push(`${path}.${key}`);
        }
        visit(nested, `${path}.${key}`);
      }
    };

    visit(coachResponseJsonSchema, "root");
    expect(failures).toEqual([]);
  });
});
