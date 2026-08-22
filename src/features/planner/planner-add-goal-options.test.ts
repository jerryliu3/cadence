import { describe, expect, it } from "vitest";
import { buildPlannerAddGoalOptions } from "@/features/planner/planner-add-goal-options";
import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

function buildEntry(overrides: Partial<PlannerDayDetailEntry>): PlannerDayDetailEntry {
  return {
    key: "goal-a:total:1",
    originalGoalId: "goal-a",
    goalTitle: "Goal A",
    unitKey: "total:1",
    label: "Goal A",
    classification: "open",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

function buildUnit(overrides: Partial<PlannerWorkUnit>): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    requirementFingerprint: "req-a",
    unitKey: "total:1",
    kind: "deadline_total",
    label: null,
    scheduledDate: "2026-08-10",
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    placementWindow: { start: "2026-08-01", end: "2026-08-31" },
    draftMoveWindow: { start: "2026-08-01", end: "2026-08-31" },
    restEligible: true,
    missPolicy: "roll_forward",
    classification: "open",
    creditState: "uncredited",
    creditedCompletionDate: null,
    goalDefaultLocalTime: null,
    scheduledTimeOverride: null,
    effectiveScheduledLocalTime: null,
    effectiveScheduledAtLocal: null,
    locked: false,
    ...overrides,
  };
}

describe("buildPlannerAddGoalOptions", () => {
  it("returns targeted goals that are not already on the day", () => {
    const options = buildPlannerAddGoalOptions({
      day: "2026-08-12",
      entriesForDay: [],
      workUnits: [
        buildUnit({ originalGoalId: "goal-a", unitKey: "total:1" }),
        buildUnit({ originalGoalId: "goal-a", unitKey: "total:2" }),
        buildUnit({
          originalGoalId: "goal-b",
          unitKey: "milestone:1",
          kind: "milestone_sequence",
          requirementFingerprint: "req-b",
        }),
        buildUnit({
          originalGoalId: "goal-c",
          unitKey: "cadence:2026-W32",
          kind: "cadence",
          requirementFingerprint: "req-c",
        }),
      ],
      goalTitles: {
        "goal-a": "Alpha",
        "goal-b": "Beta",
        "goal-c": "Cadence Goal",
      },
    });

    expect(options).toEqual([
      {
        goalId: "goal-a",
        title: "Alpha",
        kind: "deadline_total",
        targetCount: 2,
        creditedCount: 0,
      },
      {
        goalId: "goal-b",
        title: "Beta",
        kind: "milestone_sequence",
        targetCount: 1,
        creditedCount: 0,
      },
    ]);
  });

  it("filters goals already scheduled on that day or already fully credited", () => {
    const options = buildPlannerAddGoalOptions({
      day: "2026-08-12",
      entriesForDay: [buildEntry({ originalGoalId: "goal-a" })],
      workUnits: [
        buildUnit({ originalGoalId: "goal-a", unitKey: "total:1" }),
        buildUnit({
          originalGoalId: "goal-b",
          requirementFingerprint: "req-b",
          unitKey: "total:1",
          creditState: "completed_as_scheduled",
        }),
      ],
      goalTitles: {
        "goal-a": "Alpha",
        "goal-b": "Beta",
      },
    });

    expect(options).toEqual([]);
  });
});
