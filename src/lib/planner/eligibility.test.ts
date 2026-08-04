import { describe, expect, it } from "vitest";
import eligibilityFixtureJson from "../../../test/fixtures/planner-contracts/eligibility.v1.json";
import { eligibilityFixtureSchema } from "@/lib/planner/contracts/fixture-schema";
import { evaluateEndMonthV1Eligibility } from "@/lib/planner/eligibility";

describe("end-month-v1 eligibility", () => {
  const fixture = eligibilityFixtureSchema.parse(eligibilityFixtureJson);

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(
      evaluateEndMonthV1Eligibility(
        fixtureCase.scopeMonth,
        fixtureCase.goal
      )
    ).toEqual(fixtureCase.expected);
  });
});
