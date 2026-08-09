import { describe, expect, it } from "vitest";
import { buildCoachDeterministicSummary } from "./coach-context";

describe("buildCoachDeterministicSummary", () => {
  it("returns a bounded deterministic summary of current calendar state", () => {
    const summary = buildCoachDeterministicSummary({
      scopeMonth: "2026-08",
      timezone: "UTC",
      asOfDate: "2026-08-05",
      workUnits: [
        {
          originalGoalId: "goal-1",
          unitKey: "total:1",
          label: "Run intervals",
          scheduledDate: "2026-08-05",
          classification: "planned",
          creditState: "uncredited",
        },
        {
          originalGoalId: "goal-1",
          unitKey: "total:2",
          label: "Run recovery",
          scheduledDate: "2026-08-06",
          classification: "planned",
          creditState: "credited",
        },
      ],
      horizonSummary: [
        {
          goalId: "goal-1",
          totalCount: 12,
          creditedCount: 2,
          remainingCount: 10,
          scopeMonthPlannedCount: 4,
          months: [
            { month: "2026-08", plannedCount: 4 },
            { month: "2026-09", plannedCount: 4 },
            { month: "2026-10", plannedCount: 4 },
          ],
        },
      ],
      focusGoalIds: ["goal-1"],
      goalTitles: { "goal-1": "Running" },
      events: ["Applied coach proposal (2 patches)"],
    });

    expect(summary).toContain("scopeMonth=2026-08");
    expect(summary).toContain("scheduledUnits=2");
    expect(summary).toContain("horizonSummary:");
    expect(summary).toContain("goal=Running|scope=4|total=12|credited=2|remaining=10");
    expect(summary).toContain("[goal-1/total:1] Run intervals");
    expect(summary).toContain("recentCoachEvents");
    expect(summary).toContain("Applied coach proposal");
    expect(summary.length).toBeLessThanOrEqual(3500);
  });
});
