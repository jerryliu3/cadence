import { describe, expect, it } from "vitest";
import {
  buildCoachDeterministicSummary,
  buildCoachFocusGoalIds,
} from "./coach-context";

describe("buildCoachFocusGoalIds", () => {
  it("orders goals by scheduled activity and then title", () => {
    expect(
      buildCoachFocusGoalIds({
        workUnits: [
          { originalGoalId: "goal-b", scheduledDate: "2026-08-01" },
          { originalGoalId: "goal-a", scheduledDate: "2026-08-02" },
          { originalGoalId: "goal-a", scheduledDate: "2026-08-03" },
        ],
        goalTitles: {
          "goal-a": "Alpha",
          "goal-b": "Beta",
          "goal-c": "Charlie",
        },
      })
    ).toEqual(["goal-a", "goal-b", "goal-c"]);
  });

  it("caps focus goals at the server limit", () => {
    const goalTitles = Object.fromEntries(
      Array.from({ length: 45 }, (_, index) => [
        `goal-${String(index).padStart(2, "0")}`,
        `Goal ${String(index).padStart(2, "0")}`,
      ])
    );

    expect(
      buildCoachFocusGoalIds({ workUnits: [], goalTitles })
    ).toHaveLength(40);
  });
});

describe("buildCoachDeterministicSummary", () => {
  it("describes the date window instead of a scope month", () => {
    const summary = buildCoachDeterministicSummary({
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      timezone: "America/New_York",
      asOfDate: "2026-08-14",
      workUnits: [
        {
          originalGoalId: "goal-a",
          label: "Run",
          scheduledDate: "2026-08-20",
          classification: "scheduled",
          creditState: "uncredited",
        },
      ],
      goalTitles: { "goal-a": "Running" },
      focusGoalIds: ["goal-a"],
    });

    expect(summary).toContain("window=2026-08-01..2026-09-30");
    expect(summary).not.toContain("scopeMonth=");
    expect(summary).toContain("2026-08-20: Run");
  });
});
