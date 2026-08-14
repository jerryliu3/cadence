import { describe, expect, it } from "vitest";
import {
  buildCompletionFactMarkersByDate,
  buildEntriesByDate,
  resolveCalendarDayData,
} from "./calendar-entries";
import type {
  PlannerActiveItemSnapshot,
  PlannerWorkUnit,
} from "./calendar-surface.types";

function unit(scheduledDate: string): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    unitKey: "total:1",
    label: "Session",
    scheduledDate,
    classification: "open",
    creditState: "uncredited",
  };
}

function persistedItem(scheduledDate: string): PlannerActiveItemSnapshot {
  return {
    id: "item-a",
    plan_goal_id: "goal-a",
    unit_key: "total:1",
    requirement_kind: "deadline_total",
    scheduled_date: scheduledDate,
    original_scheduled_date: scheduledDate,
    classification: "open",
    credit_state: "uncredited",
    locked: false,
    revision: 0,
    credited_completion_id: null,
    credited_completion_date: null,
  };
}

describe("planner calendar entries", () => {
  it("shows moved-from and moved-to markers for a persisted session", () => {
    const entriesByDate = buildEntriesByDate({
      workUnits: [unit("2026-08-07")],
      activeItems: [persistedItem("2026-08-05")],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
      draftItemEdits: {
        "goal-a:total:1": { scheduledDate: "2026-08-07" },
      },
      draftCommands: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sequence: 1,
          kind: "move_item",
          goalId: "goal-a",
          unitKey: "total:1",
          sourceDate: "2026-08-05",
          scheduledDate: "2026-08-07",
        },
      ],
    });

    expect(entriesByDate.get("2026-08-05")?.[0]).toMatchObject({
      draftGhost: true,
      draftDiffKind: "moved_from",
    });
    expect(entriesByDate.get("2026-08-07")?.[0]).toMatchObject({
      draftGhost: false,
      draftDiffKind: "moved_to",
    });
  });

  it("never renders a preview-only session", () => {
    const entriesByDate = buildEntriesByDate({
      workUnits: [unit("2026-08-07")],
      activeItems: [],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
      draftItemEdits: {},
    });

    expect(entriesByDate.size).toBe(0);
  });

  it("returns persisted entries and completion markers from one projection", () => {
    const marker = {
      key: "goal-a:total:1:2026-08-06",
      originalGoalId: "goal-a",
      unitKey: "total:1",
      goalTitle: "Goal A",
      scheduledDate: "2026-08-05",
    };
    const result = resolveCalendarDayData({
      day: "2026-08-06",
      entriesByDate: new Map(),
      completionFactMarkersByDate: new Map([["2026-08-06", [marker]]]),
    });

    expect(result.entries).toEqual([]);
    expect(result.completionFactMarkers).toEqual([marker]);
  });

  it("keeps completion facts visible outside the scheduled date", () => {
    const markers = buildCompletionFactMarkersByDate({
      workUnits: [
        {
          ...unit("2026-08-31"),
          creditedCompletionDate: "2026-09-01",
          creditState: "completed_elsewhere",
        },
      ],
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
    });

    expect(markers.get("2026-09-01")?.[0]).toMatchObject({
      originalGoalId: "goal-a",
      scheduledDate: "2026-08-31",
    });
  });
});
