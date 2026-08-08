import { describe, expect, it } from "vitest";
import { applyCoachPolicyPatches } from "./coach-policy";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { CoachPolicyPatch } from "@/lib/planner/coach";

function basePolicy() {
  return createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z");
}

describe("applyCoachPolicyPatches", () => {
  it("applies supported rest and blackout patches", () => {
    const patches: CoachPolicyPatch[] = [
      { kind: "set_rest_weekdays", restWeekdays: [1, 3, 3] },
      { kind: "add_blackout_range", start: "2026-08-12", end: "2026-08-15" },
    ];
    const result = applyCoachPolicyPatches({
      policy: basePolicy(),
      patches,
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(2);
    expect(result.ignoredPatchCount).toBe(0);
    expect(result.unsupportedPatchCount).toBe(0);
    expect(result.outOfScopePatchCount).toBe(0);
    expect(result.policy.restWeekdays).toEqual([1, 3]);
    expect(result.policy.blackoutRanges).toEqual([
      { start: "2026-08-12", end: "2026-08-15" },
    ]);
  });

  it("removes existing blackout windows", () => {
    const policy = basePolicy();
    policy.blackoutRanges = [{ start: "2026-08-10", end: "2026-08-11" }];
    const result = applyCoachPolicyPatches({
      policy,
      patches: [
        {
          kind: "remove_blackout_range",
          start: "2026-08-10",
          end: "2026-08-11",
        },
      ],
      allowedGoalIds: new Set(["12000000-0000-4000-8000-000000000001"]),
    });

    expect(result.appliedPatchCount).toBe(1);
    expect(result.ignoredPatchCount).toBe(0);
    expect(result.noOpPatchCount).toBe(0);
    expect(result.policy.blackoutRanges).toEqual([]);
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
    expect(result.unsupportedPatchCount).toBe(0);
  });
});
