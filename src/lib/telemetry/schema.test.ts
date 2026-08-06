import { describe, expect, it } from "vitest";
import telemetryExamples from "../../../test/fixtures/telemetry/events.v1.json";
import { createOwnerPseudonym } from "./pseudonym";
import { telemetryEventV1Schema } from "./schema";

describe("telemetry event schema", () => {
  it("validates one golden event for every frozen catalog entry", () => {
    const parsed = telemetryExamples.map((event) =>
      telemetryEventV1Schema.parse(event)
    );

    expect(new Set(parsed.map((event) => event.eventName))).toEqual(
      new Set([
        "planner.preview.completed",
        "planner.publish.completed",
        "planner.mutation.completed",
        "planner.staleness.detected",
        "planner.invariant.failed",
        "targeted_completion.completed",
        "ai.request.completed",
      ])
    );
  });

  it("rejects raw identifiers and content fields", () => {
    const preview = telemetryExamples[0];

    expect(
      telemetryEventV1Schema.safeParse({
        ...preview,
        ownerId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(false);
    expect(
      telemetryEventV1Schema.safeParse({
        ...preview,
        data: {
          ...preview.data,
          rawPrompt: "private goal text",
        },
      }).success
    ).toBe(false);
  });

  it("requires typed failures and bounded counters", () => {
    const preview = telemetryExamples[0];

    expect(
      telemetryEventV1Schema.safeParse({
        ...preview,
        result: "error",
        statusCode: 500,
        errorCode: null,
      }).success
    ).toBe(false);
    expect(
      telemetryEventV1Schema.safeParse({
        ...preview,
        counts: { eligibleGoals: 101 },
      }).success
    ).toBe(false);
    const publish = telemetryExamples.find(
      (event) => event.eventName === "planner.publish.completed"
    );
    if (!publish) {
      throw new Error("Missing publish telemetry fixture.");
    }
    expect(
      telemetryEventV1Schema.safeParse({
        ...publish,
        counts: { timedUnits: 5001 },
      }).success
    ).toBe(false);
  });
});

describe("owner telemetry pseudonyms", () => {
  const input = {
    ownerId: "11111111-1111-4111-8111-111111111111",
    environment: "test" as const,
    hmacKey: "test-key-that-is-at-least-thirty-two-characters",
    keyVersion: 7,
  };

  it("is deterministic only within the same environment and key version", () => {
    const first = createOwnerPseudonym(input);
    const second = createOwnerPseudonym(input);
    const production = createOwnerPseudonym({
      ...input,
      environment: "production",
    });
    const nextVersion = createOwnerPseudonym({
      ...input,
      keyVersion: 8,
    });
    const rotated = createOwnerPseudonym({
      ...input,
      hmacKey: "rotated-key-that-is-at-least-thirty-two-chars",
      keyVersion: 8,
    });

    expect(first).toEqual(second);
    expect(first.ownerPseudonym).toMatch(/^[a-f0-9]{64}$/);
    expect(production.ownerPseudonym).not.toBe(first.ownerPseudonym);
    expect(nextVersion.ownerPseudonym).not.toBe(first.ownerPseudonym);
    expect(rotated.ownerPseudonym).not.toBe(first.ownerPseudonym);
  });

  it("rejects weak keys", () => {
    expect(() =>
      createOwnerPseudonym({ ...input, hmacKey: "too-short" })
    ).toThrow("at least 32");
  });
});
