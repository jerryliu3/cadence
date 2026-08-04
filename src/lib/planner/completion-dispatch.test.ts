import { describe, expect, it } from "vitest";
import completionDispatchFixture from "../../../test/fixtures/planner-contracts/completion-dispatch.v1.json";
import { completionDispatchFixtureSchema } from "./contracts/fixture-schema";
import { resolveCompletionDispatch } from "./completion-dispatch";

describe("completion dispatch bridge", () => {
  const fixture = completionDispatchFixtureSchema.parse(
    completionDispatchFixture
  );

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(resolveCompletionDispatch(fixtureCase.input)).toEqual(
      fixtureCase.expected
    );
  });

  it("never routes a targeted recurring goal to legacy period semantics", () => {
    for (const fixtureCase of fixture.cases.filter(
      (candidate) => candidate.input.targetedRecurring
    )) {
      expect(resolveCompletionDispatch(fixtureCase.input).route).not.toBe(
        "legacy_period"
      );
    }
  });
});
