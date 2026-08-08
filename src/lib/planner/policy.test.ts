import { describe, expect, it } from "vitest";
import {
  compilePlannerPolicy,
  createDefaultPlannerPolicy,
  getCompiledDateCost,
  getSpacingIdealDate,
  isDateAllowedByPolicy,
  plannerPolicySchema,
} from "@/lib/planner/policy";

describe("versioned planner policy compiler", () => {
  it("applies rest days to effortful work but exempts daily cadence", () => {
    const policy = createDefaultPlannerPolicy(
      "America/New_York",
      "2026-08-01T00:00:00Z"
    );
    policy.restWeekdays = [0];
    const compiled = compilePlannerPolicy(policy);

    expect(
      isDateAllowedByPolicy(compiled, "goal-a", "2026-08-02", true)
    ).toBe(false);
    expect(
      isDateAllowedByPolicy(compiled, "goal-a", "2026-08-02", false)
    ).toBe(true);
  });

  it("compiles hard blackout and bounded semantic date costs", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.blackoutRanges = [
      { start: "2026-08-03", end: "2026-08-03" },
    ];
    policy.datePreferences = [
      {
        goalId: "goal-a",
        start: "2026-08-04",
        end: "2026-08-04",
        effect: "avoid",
      },
    ];
    const compiled = compilePlannerPolicy(policy);

    expect(
      isDateAllowedByPolicy(compiled, "goal-a", "2026-08-03", true)
    ).toBe(false);
    expect(getCompiledDateCost(compiled, "goal-a", "2026-08-04")).toBe(8);
    expect(getCompiledDateCost(compiled, "goal-b", "2026-08-04")).toBe(0);
  });

  it("treats rest days and blackouts as advisory costs", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.restWeekdays = [0];
    policy.blackoutRanges = [{ start: "2026-08-03", end: "2026-08-03" }];
    const compiled = compilePlannerPolicy(policy);

    expect(getCompiledDateCost(compiled, "goal-a", "2026-08-03")).toBe(10);
    expect(getCompiledDateCost(compiled, "goal-a", "2026-08-02", true)).toBe(
      6
    );
    expect(getCompiledDateCost(compiled, "goal-a", "2026-08-02", false)).toBe(
      0
    );
  });

  it("uses deterministic front-load, even, and flexible ideals", () => {
    const dates = ["2026-08-01", "2026-08-02", "2026-08-03"];
    expect(getSpacingIdealDate("front_load", 1, 3, dates)).toBe(
      "2026-08-02"
    );
    expect(getSpacingIdealDate("even", 1, 3, dates)).toBe("2026-08-02");
    expect(getSpacingIdealDate("flexible", 1, 3, dates)).toBeNull();
  });

  it("rejects an unconfirmed invalid timezone", () => {
    expect(() =>
      plannerPolicySchema.parse({
        ...createDefaultPlannerPolicy(
          "UTC",
          "2026-08-01T00:00:00Z"
        ),
        timezone: "Mars/Olympus",
      })
    ).toThrow();
  });

  it("requires at least one weekday when a goal restriction exists", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.goalAllowedWeekdays["goal-a"] = [];

    expect(() => compilePlannerPolicy(policy)).toThrow();
  });

  it("omits empty goal monthly distributions from compiled policy", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.goalMonthlyDistributions = {};

    const compiled = compilePlannerPolicy(policy);

    expect(compiled.policy.goalMonthlyDistributions).toBeUndefined();
    expect("goalMonthlyDistributions" in compiled.policy).toBe(false);
  });
});
