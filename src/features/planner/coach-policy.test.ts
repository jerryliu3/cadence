import { describe, expect, it } from "vitest";
import { applyCoachPolicyPatches } from "./coach-policy";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";

function basePolicy() {
  return createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
}

describe("applyCoachPolicyPatches", () => {
  it("applies rest/blackout patches and marks legacy patches unsupported", () => {
    const patches: CoachPolicyPatch[] = [
      { kind: "set_rest_weekdays", restWeekdays: [1, 3, 3] },
      { kind: "add_blackout_range", start: "2026-08-12", end: "2026-08-15" },
      {
        kind: "set_goal_allowed_weekdays",
        goalId: "12000000-0000-4000-8000-000000000001",
        weekdays: [1, 2, 2, 4],
      },
      {
        kind: "set_goal_date_preference",
        goalId: null,
        start: "2026-08-12",
        end: "2026-08-15",
        effect: "avoid",
      },
      { kind: "set_spacing_strategy", spacingStrategy: "front_load" },
      {
        kind: "set_goal_spacing_strategy",
        goalId: "12000000-0000-4000-8000-000000000001",
        spacingStrategy: "flexible",
      },
      {
        kind: "set_goal_monthly_distribution",
        goalId: "12000000-0000-4000-8000-000000000001",
        distribution: [
          { month: "2026-08", count: 3 },
          { month: "2026-09", count: 4 },
        ],
      },
    ];
    const result = applyCoachPolicyPatches({
      policy: basePolicy(),
      patches,
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(2);
    expect(result.ignoredPatchCount).toBe(5);
    expect(result.unsupportedPatchCount).toBe(5);
    expect(result.policy.restWeekdays).toEqual([1, 3]);
    expect(result.policy.blackoutRanges).toEqual([
      { start: "2026-08-12", end: "2026-08-15" },
    ]);
  });

  it("tracks out-of-scope legacy goal patches", () => {
    const result = applyCoachPolicyPatches({
      policy: basePolicy(),
      patches: [
        {
          kind: "set_goal_allowed_weekdays",
          goalId: "12000000-0000-4000-8000-000000000099",
          weekdays: [1, 2],
        },
        {
          kind: "set_goal_monthly_distribution",
          goalId: "12000000-0000-4000-8000-000000000099",
          distribution: [{ month: "2026-08", count: 2 }],
        },
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(0);
    expect(result.ignoredPatchCount).toBe(2);
    expect(result.outOfScopePatchCount).toBe(2);
    expect(result.unsupportedPatchCount).toBe(2);
  });

  it("treats duplicate supported patches as no-ops", () => {
    const policy = basePolicy();
    policy.restWeekdays = [0, 1];
    policy.blackoutRanges = [{ start: "2026-08-10", end: "2026-08-11" }];
    const result = applyCoachPolicyPatches({
      policy,
      patches: [
        { kind: "set_rest_weekdays", restWeekdays: [0, 1] },
        { kind: "add_blackout_range", start: "2026-08-10", end: "2026-08-11" },
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(0);
    expect(result.ignoredPatchCount).toBe(2);
    expect(result.noOpPatchCount).toBe(2);
  });
});
