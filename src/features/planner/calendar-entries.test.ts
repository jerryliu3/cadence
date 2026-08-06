import { describe, expect, it } from "vitest";
import {
  buildCompletionFactMarkersByDate,
  buildEntriesByDate,
} from "./calendar-entries";
import type { PlannerWorkUnit } from "./calendar-surface.types";

function unit({
  goalId,
  unitKey,
  scheduledDate,
}: {
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
}): PlannerWorkUnit {
  return {
    originalGoalId: goalId,
    unitKey,
    label: null,
    scheduledDate,
    classification: "open",
    creditState: "uncredited",
  };
}

describe("buildEntriesByDate draft visual diff", () => {
  it("shows moved-from and moved-to markers for coach policy reflow", () => {
    const entriesByDate = buildEntriesByDate({
      baselineWorkUnits: [unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-05" })],
      workUnits: [unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-07" })],
      activeItems: [],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
      draftItemEdits: {},
    });

    const movedFrom = (entriesByDate.get("2026-08-05") ?? []).find(
      (entry) => entry.unitKey === "total:1" && entry.draftDiffKind === "moved_from"
    );
    const movedTo = (entriesByDate.get("2026-08-07") ?? []).find(
      (entry) => entry.unitKey === "total:1" && entry.draftDiffKind === "moved_to"
    );

    expect(movedFrom).toMatchObject({
      originalGoalId: "goal-a",
      unitKey: "total:1",
      draftGhost: true,
      draftDiffFromDate: "2026-08-05",
      draftDiffToDate: "2026-08-07",
    });
    expect(movedTo).toMatchObject({
      originalGoalId: "goal-a",
      unitKey: "total:1",
      draftGhost: false,
      draftDiffFromDate: "2026-08-05",
      draftDiffToDate: "2026-08-07",
    });
  });
});

describe("buildCompletionFactMarkersByDate", () => {
  it("includes markers outside the current scope month when visible", () => {
    const markersByDate = buildCompletionFactMarkersByDate({
      workUnits: [
        {
          ...unit({
            goalId: "goal-a",
            unitKey: "total:1",
            scheduledDate: "2026-08-31",
          }),
          creditedCompletionDate: "2026-09-01",
          creditState: "completed_elsewhere",
        },
      ],
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
    });

    expect(markersByDate.get("2026-09-01")).toEqual([
      {
        key: "goal-a:total:1:2026-09-01",
        originalGoalId: "goal-a",
        unitKey: "total:1",
        goalTitle: "Goal A",
        scheduledDate: "2026-08-31",
      },
    ]);
  });
});
