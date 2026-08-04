import { describe, expect, it } from "vitest";
import mutationFixtureJson from "../../../test/fixtures/planner-contracts/mutation-freshness.v1.json";
import { mutationFreshnessFixtureSchema } from "@/lib/planner/contracts/fixture-schema";
import { evaluatePlannerMutationFreshness } from "@/lib/planner/freshness";

describe("planner dual freshness contract", () => {
  const fixture = mutationFreshnessFixtureSchema.parse(mutationFixtureJson);

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(evaluatePlannerMutationFreshness(fixtureCase.mutation)).toEqual(
      fixtureCase.expected
    );
  });
});
