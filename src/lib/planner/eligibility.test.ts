import { describe, expect, it } from "vitest";
import eligibilityFixtureJson from "../../../test/fixtures/planner-contracts/eligibility.v1.json";
import { eligibilityFixtureSchema } from "@/lib/planner/contracts/fixture-schema";
import type { Goal } from "@/lib/goals/types";
import {
  evaluateGoalEligibility,
  evaluateOverlapV1Eligibility,
  type EligibilityGoal,
} from "@/lib/planner/eligibility";

describe("frozen overlap eligibility fixture", () => {
  const fixture = eligibilityFixtureSchema.parse(eligibilityFixtureJson);

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(
      evaluateOverlapV1Eligibility(
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

describe("goal-level eligibility guards", () => {
  const cadenceGoal: Goal = {
    id: "goal-cadence-open",
    owner_id: "owner-a",
    title: "Open cadence goal",
    description: null,
    category: "Health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: null,
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("keeps open-ended cadence goals eligible once started", () => {
    expect(
      evaluateGoalEligibility({
        scopeMonth: "2026-08",
        ownerId: "owner-a",
        goal: cadenceGoal,
        currentLinkRole: "none",
      })
    ).toEqual({
      eligible: true,
      reason: "eligible",
    });
  });

  it("keeps future open-ended cadence goals out of the active month", () => {
    expect(
      evaluateGoalEligibility({
        scopeMonth: "2026-08",
        ownerId: "owner-a",
        goal: {
          ...cadenceGoal,
          start_date: "2026-09-01",
        },
        currentLinkRole: "none",
      })
    ).toEqual({
      eligible: false,
      reason: "starts_after_scope",
    });
  });

  it("requires end dates for targeted recurring goals", () => {
    expect(
      evaluateGoalEligibility({
        scopeMonth: "2026-08",
        ownerId: "owner-a",
        goal: {
          ...cadenceGoal,
          id: "goal-target-no-end",
          target_count: 12,
        },
        currentLinkRole: "none",
      })
    ).toEqual({
      eligible: false,
      reason: "missing_end_date",
    });
  });

  it("marks ordinal goals with overlong horizons as ineligible", () => {
    const longHorizonGoal: Goal = {
      id: "goal-long",
      owner_id: "owner-a",
      title: "Long horizon goal",
      description: null,
      category: "Health",
      color: null,
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 52,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2028-12-31",
      photo_path: null,
      is_group: false,
      is_deleted: false,
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(
      evaluateGoalEligibility({
        scopeMonth: "2026-08",
        ownerId: "owner-a",
        goal: longHorizonGoal,
        currentLinkRole: "none",
      })
    ).toEqual({
      eligible: false,
      reason: "horizon_too_long",
    });
  });

  it("marks cadence goals with overlong bounded horizons as ineligible", () => {
    expect(
      evaluateGoalEligibility({
        scopeMonth: "2026-08",
        ownerId: "owner-a",
        goal: {
          ...cadenceGoal,
          id: "goal-cadence-overlong",
          end_date: "2028-12-31",
        },
        currentLinkRole: "none",
      })
    ).toEqual({
      eligible: false,
      reason: "horizon_too_long",
    });
  });
});
