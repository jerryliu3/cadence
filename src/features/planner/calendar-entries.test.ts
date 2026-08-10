import { describe, expect, it } from "vitest";
import {
  buildCanonicalEntryDayByKey,
  buildCompletionFactMarkerDayByIdentity,
  buildCompletionFactMarkersByDate,
  buildEntriesByDate,
  resolveCalendarDayData,
} from "./calendar-entries";
import type {
  PlannerCompletionFactMarker,
  PlannerWorkUnit,
} from "./calendar-surface.types";

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

describe("resolveCalendarDayData", () => {
  it("suppresses supplemental duplicates for canonical units on other days", () => {
    const currentWorkUnits = [
      unit({
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-31",
      }),
    ];
    const currentEntriesByDate = buildEntriesByDate({
      baselineWorkUnits: currentWorkUnits,
      workUnits: currentWorkUnits,
      activeItems: [],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
      draftItemEdits: {},
    });

    const supplementalWorkUnits = [
      unit({
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-09-01",
      }),
      unit({
        goalId: "goal-b",
        unitKey: "total:1",
        scheduledDate: "2026-09-01",
      }),
    ];
    const supplementalEntriesByDate = buildEntriesByDate({
      baselineWorkUnits: supplementalWorkUnits,
      workUnits: supplementalWorkUnits,
      activeItems: [],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A", "goal-b": "Goal B" },
      draftItemEdits: {},
    });

    const result = resolveCalendarDayData({
      day: "2026-09-01",
      entriesByDate: currentEntriesByDate,
      canonicalEntryDayByKey: buildCanonicalEntryDayByKey(currentWorkUnits),
      completionFactMarkersByDate: new Map<string, PlannerCompletionFactMarker[]>(),
      completionFactMarkerDayByIdentity: new Map(),
      visibleMonthCalendarDataByMonth: new Map([
        [
          "2026-09",
          {
            entriesByDate: supplementalEntriesByDate,
            completionFactMarkersByDate: new Map(),
          },
        ],
      ]),
    });

    expect(result.entries.map((entry) => entry.key)).toEqual(["goal-b:total:1"]);
  });

  it("suppresses supplemental entries for unscheduled canonical units", () => {
    const currentWorkUnits = [
      unit({
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: null,
      }),
    ];
    const supplementalWorkUnits = [
      unit({
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-09-01",
      }),
    ];
    const supplementalEntriesByDate = buildEntriesByDate({
      baselineWorkUnits: supplementalWorkUnits,
      workUnits: supplementalWorkUnits,
      activeItems: [],
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
      goalTitles: { "goal-a": "Goal A" },
      draftItemEdits: {},
    });

    const result = resolveCalendarDayData({
      day: "2026-09-01",
      entriesByDate: new Map(),
      canonicalEntryDayByKey: buildCanonicalEntryDayByKey(currentWorkUnits),
      completionFactMarkersByDate: new Map(),
      completionFactMarkerDayByIdentity: new Map(),
      visibleMonthCalendarDataByMonth: new Map([
        [
          "2026-09",
          {
            entriesByDate: supplementalEntriesByDate,
            completionFactMarkersByDate: new Map(),
          },
        ],
      ]),
    });

    expect(result.entries).toEqual([]);
  });

  it("suppresses supplemental completion markers for canonical units", () => {
    const currentWorkUnits = [
      unit({
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-30",
      }),
    ];
    const currentCompletionFactMarkersByDate = new Map<
      string,
      PlannerCompletionFactMarker[]
    >([
      [
        "2026-08-31",
        [
          {
            key: "goal-a:total:1:2026-08-31",
            originalGoalId: "goal-a",
            unitKey: "total:1",
            goalTitle: "Goal A",
            scheduledDate: "2026-08-30",
          },
        ],
      ],
    ]);
    const supplementalCompletionFactMarkersByDate = new Map<
      string,
      PlannerCompletionFactMarker[]
    >([
      [
        "2026-09-01",
        [
          {
            key: "goal-a:total:1:2026-09-01",
            originalGoalId: "goal-a",
            unitKey: "total:1",
            goalTitle: "Goal A",
            scheduledDate: "2026-08-30",
          },
          {
            key: "goal-b:total:1:2026-09-01",
            originalGoalId: "goal-b",
            unitKey: "total:1",
            goalTitle: "Goal B",
            scheduledDate: "2026-09-01",
          },
        ],
      ],
    ]);

    const result = resolveCalendarDayData({
      day: "2026-09-01",
      entriesByDate: new Map(),
      canonicalEntryDayByKey: buildCanonicalEntryDayByKey(currentWorkUnits),
      completionFactMarkersByDate: currentCompletionFactMarkersByDate,
      completionFactMarkerDayByIdentity: buildCompletionFactMarkerDayByIdentity(
        currentCompletionFactMarkersByDate
      ),
      visibleMonthCalendarDataByMonth: new Map([
        [
          "2026-09",
          {
            entriesByDate: new Map(),
            completionFactMarkersByDate: supplementalCompletionFactMarkersByDate,
          },
        ],
      ]),
    });

    expect(result.completionFactMarkers).toEqual([
      {
        key: "goal-b:total:1:2026-09-01",
        originalGoalId: "goal-b",
        unitKey: "total:1",
        goalTitle: "Goal B",
        scheduledDate: "2026-09-01",
      },
    ]);
  });
});
