import { describe, expect, it } from "vitest";
import { applyCoachPolicyPatches } from "./coach-policy";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";

function basePolicy() {
  return createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
}

describe("applyCoachPolicyPatches", () => {
  it("applies supported policy patches and reports counts", () => {
    const patches: CoachPolicyPatch[] = [
      { kind: "set_rest_weekdays", restWeekdays: [1, 3, 3] },
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

    expect(result.appliedPatchCount).toBe(6);
    expect(result.ignoredPatchCount).toBe(0);
    expect(result.policy.restWeekdays).toEqual([1, 3]);
    expect(result.policy.goalAllowedWeekdays).toEqual({
      "12000000-0000-4000-8000-000000000001": [1, 2, 4],
    });
    expect(result.policy.datePreferences).toHaveLength(1);
    expect(result.policy.spacingStrategy).toBe("front_load");
    expect(result.policy.goalSpacingStrategies).toEqual({
      "12000000-0000-4000-8000-000000000001": "flexible",
    });
    expect(result.policy.goalMonthlyDistributions).toEqual({
      "12000000-0000-4000-8000-000000000001": [
        { month: "2026-08", count: 3 },
        { month: "2026-09", count: 4 },
      ],
    });
  });

  it("ignores goal-scoped patches for unknown goals", () => {
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
    expect(result.policy.goalAllowedWeekdays).toEqual({});
    expect(result.policy.goalMonthlyDistributions).toEqual({});
  });

  it("treats no-op patches as ignored changes", () => {
    const policy = basePolicy();
    policy.goalAllowedWeekdays["12000000-0000-4000-8000-000000000001"] = [
      0, 1, 2, 3, 4, 5, 6,
    ];
    policy.goalSpacingStrategies["12000000-0000-4000-8000-000000000001"] =
      "even";
    policy.goalMonthlyDistributions ??= {};
    policy.goalMonthlyDistributions["12000000-0000-4000-8000-000000000001"] = [
      { month: "2026-08", count: 2 },
      { month: "2026-09", count: 3 },
    ];
    const result = applyCoachPolicyPatches({
      policy,
      patches: [
        {
          kind: "set_goal_allowed_weekdays",
          goalId: "12000000-0000-4000-8000-000000000001",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
        {
          kind: "set_goal_spacing_strategy",
          goalId: "12000000-0000-4000-8000-000000000001",
          spacingStrategy: "even",
        },
        {
          kind: "set_goal_monthly_distribution",
          goalId: "12000000-0000-4000-8000-000000000001",
          distribution: [
            { month: "2026-08", count: 2 },
            { month: "2026-09", count: 3 },
          ],
        },
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(0);
    expect(result.ignoredPatchCount).toBe(3);
  });

  it("clears goal monthly distribution independently per goal", () => {
    const policy = basePolicy();
    policy.goalMonthlyDistributions ??= {};
    policy.goalMonthlyDistributions["12000000-0000-4000-8000-000000000001"] = [
      { month: "2026-08", count: 2 },
    ];
    const result = applyCoachPolicyPatches({
      policy,
      patches: [
        {
          kind: "clear_goal_monthly_distribution",
          goalId: "12000000-0000-4000-8000-000000000001",
        },
        {
          kind: "clear_goal_monthly_distribution",
          goalId: "12000000-0000-4000-8000-000000000099",
        },
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(1);
    expect(result.ignoredPatchCount).toBe(1);
    expect(result.policy.goalMonthlyDistributions).toEqual({});
  });
});
