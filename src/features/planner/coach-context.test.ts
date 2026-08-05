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
          label: "Run intervals",
          scheduledDate: "2026-08-05",
          classification: "planned",
          creditState: "uncredited",
        },
        {
          originalGoalId: "goal-1",
          label: "Run recovery",
          scheduledDate: "2026-08-06",
          classification: "planned",
          creditState: "credited",
        },
      ],
      events: ["Applied coach proposal (2 patches)"],
    });

    expect(summary).toContain("scopeMonth=2026-08");
    expect(summary).toContain("scheduledUnits=2");
    expect(summary).toContain("recentCoachEvents");
    expect(summary).toContain("Applied coach proposal");
    expect(summary.length).toBeLessThanOrEqual(3500);
  });
});
