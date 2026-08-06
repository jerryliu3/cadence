import { describe, expect, it } from "vitest";
import eligibilityFixtureJson from "../../../test/fixtures/planner-contracts/eligibility.v1.json";
import { eligibilityFixtureSchema } from "@/lib/planner/contracts/fixture-schema";
import {
  evaluateEndMonthV1Eligibility,
  evaluateOverlapV1Eligibility,
  type EligibilityGoal,
} from "@/lib/planner/eligibility";

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

describe("overlap-v1 eligibility", () => {
  const baseGoal: EligibilityGoal = {
    ownedByViewer: true,
    isGroup: false,
    isDeleted: false,
    archivedAt: null,
    currentLinkRole: "none",
    outgoingShareCount: 0,
    startDate: "2026-07-15",
    endDate: "2026-09-20",
  };

  it("includes goals that overlap the scope month", () => {
    expect(evaluateOverlapV1Eligibility("2026-08", baseGoal)).toEqual({
      eligible: true,
      reason: "eligible",
    });
  });

  it("keeps future-starting goals outside the selected month", () => {
    expect(
      evaluateOverlapV1Eligibility("2026-08", {
        ...baseGoal,
        startDate: "2026-09-01",
        endDate: "2026-10-01",
      })
    ).toEqual({
      eligible: false,
      reason: "starts_after_scope",
    });
  });

  it("keeps fully historical goals outside the selected month", () => {
    expect(
      evaluateOverlapV1Eligibility("2026-08", {
        ...baseGoal,
        startDate: "2026-05-01",
        endDate: "2026-07-31",
      })
    ).toEqual({
      eligible: false,
      reason: "end_outside_scope",
    });
  });
});
