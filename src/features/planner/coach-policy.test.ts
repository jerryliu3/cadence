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
    ];
    const result = applyCoachPolicyPatches({
      policy: basePolicy(),
      patches,
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(5);
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
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(0);
    expect(result.ignoredPatchCount).toBe(1);
    expect(result.policy.goalAllowedWeekdays).toEqual({});
  });
});
