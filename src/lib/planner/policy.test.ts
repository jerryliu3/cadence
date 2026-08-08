import { describe, expect, it } from "vitest";
import {
  compilePlannerPolicy,
  createDefaultPlannerPolicy,
  getCompiledDateCost,
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

    expect(getCompiledDateCost(compiled, "2026-08-02", true)).toBe(6);
    expect(getCompiledDateCost(compiled, "2026-08-02", false)).toBe(0);
  });

  it("compiles hard blackout and rest-day advisory costs", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.blackoutRanges = [
      { start: "2026-08-03", end: "2026-08-03" },
    ];
    policy.restWeekdays = [1];
    const compiled = compilePlannerPolicy(policy);

    expect(getCompiledDateCost(compiled, "2026-08-03", true)).toBe(16);
    expect(getCompiledDateCost(compiled, "2026-08-04", true)).toBe(0);
    expect(getCompiledDateCost(compiled, "2026-08-04", false)).toBe(0);
  });

  it("treats rest days and blackouts as advisory costs", () => {
    const policy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-01T00:00:00Z"
    );
    policy.restWeekdays = [0];
    policy.blackoutRanges = [{ start: "2026-08-03", end: "2026-08-03" }];
    const compiled = compilePlannerPolicy(policy);

    expect(getCompiledDateCost(compiled, "2026-08-03")).toBe(10);
    expect(getCompiledDateCost(compiled, "2026-08-02", true)).toBe(6);
    expect(getCompiledDateCost(compiled, "2026-08-02", false)).toBe(0);
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

});
