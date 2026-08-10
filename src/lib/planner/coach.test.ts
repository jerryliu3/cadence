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

function assertNoDisallowedGeminiKeywords(value: unknown) {
  const disallowed = new Set([
    "nullable",
    "format",
    "pattern",
    "minimum",
    "maximum",
  ]);
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry);
      }
      return;
    }
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (disallowed.has(key)) {
        throw new Error(`Disallowed Gemini keyword found: ${key}`);
      }
    }
    for (const nested of Object.values(record)) {
      visit(nested);
    }
  };
  visit(value);
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
    expect(proposalSchema.required).toEqual(["calendarIntent"]);
  });

  it("avoids array-valued `type` fields incompatible with Gemini schema validation", () => {
    expect(() => assertNoArrayValuedType(coachResponseJsonSchema)).not.toThrow();
  });

  it("avoids Gemini-incompatible schema keywords", () => {
    expect(() =>
      assertNoDisallowedGeminiKeywords(coachResponseJsonSchema)
    ).not.toThrow();
  });
});
