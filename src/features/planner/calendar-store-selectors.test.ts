import { describe, expect, it, vi } from "vitest";
import type {
  DraftCommandState,
  ScopedPlannerDraftCommand,
} from "@/features/planner/draft-command-reducer";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  readPlannerCalendarDayProjection,
  selectEffectiveDraftCommands,
  selectPlannerCalendarDayProjectionsByDay,
  selectPlannerCalendarStoreProjection,
  selectVisibleDraftItemEditsByMonth,
  type PlannerCalendarDayProjection,
  type PlannerCalendarStoreProjection,
} from "./calendar-store-selectors";

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

function buildPreview(workUnits: PlannerWorkUnit[]): NonNullable<PlannerContextPayload["preview"]> {
  return {
    eligibilityMode: "overlap_v1",
    preserveExistingAssignments: true,
    generationInputHash: "hash",
    solver: {
      placementStatus: "complete",
      searchStatus: "all_units_placed",
      capacityStatus: "unverified",
      issueCodes: [],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: false,
    },
    workUnits,
  };
}

function buildContext(workUnits: PlannerWorkUnit[]): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-15",
    timezone: "UTC",
    goalTitles: {
      "goal-a": "Goal A",
      "goal-b": "Goal B",
      "goal-c": "Goal C",
    },
    preferences: null,
    capabilities: {
      calendarEnabled: true,
      crossMonthMovesEnabled: false,
    },
    activePlan: null,
    preview: buildPreview(workUnits),
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: "digest",
    },
    staleness: {
      stale: false,
      reasons: [],
    },
  };
}

function commandState(commands: ScopedPlannerDraftCommand[]): DraftCommandState {
  return {
    commands,
    nextSequence: commands.length,
  };
}

describe("calendar store selectors", () => {
  it("filters scope draft commands to preview entry keys", () => {
    const state = commandState([
      {
        scopeMonth: "2026-08",
        command: {
          id: "cmd-a",
          sequence: 1,
          kind: "move_item",
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-10",
        },
      },
      {
        scopeMonth: "2026-08",
        command: {
          id: "cmd-b",
          sequence: 2,
          kind: "move_item",
          goalId: "goal-z",
          unitKey: "total:9",
          scheduledDate: "2026-08-12",
        },
      },
    ]);

    const effectiveDraftCommands = selectEffectiveDraftCommands({
      draftCommandState: state,
      scopeMonth: "2026-08",
      previewWorkUnits: [unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-05" })],
    });

    expect(effectiveDraftCommands).toHaveLength(1);
    expect(effectiveDraftCommands[0]).toMatchObject({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-08-10",
    });
  });

  it("builds visible month item edits only for preview-backed entries", () => {
    const state = commandState([
      {
        scopeMonth: "2026-09",
        command: {
          id: "cmd-a",
          sequence: 1,
          kind: "move_item",
          goalId: "goal-b",
          unitKey: "total:1",
          scheduledDate: "2026-09-10",
        },
      },
      {
        scopeMonth: "2026-09",
        command: {
          id: "cmd-b",
          sequence: 2,
          kind: "rename_item",
          goalId: "goal-c",
          unitKey: "total:2",
          label: "Renamed",
        },
      },
    ]);

    const visibleDraftItemEditsByMonth = selectVisibleDraftItemEditsByMonth({
      draftCommandState: state,
      visibleMonthContexts: {
        "2026-09": {
          scopeMonth: "2026-09",
          goalTitles: {},
          activePlan: null,
          preview: buildPreview([
            unit({
              goalId: "goal-b",
              unitKey: "total:1",
              scheduledDate: "2026-09-01",
            }),
          ]),
        },
      },
    });

    expect(visibleDraftItemEditsByMonth["2026-09"]).toEqual({
      "goal-b:total:1": {
        scheduledDate: "2026-09-10",
      },
    });
  });

  it("builds planner store projection with filtered draft commands", () => {
    const context = buildContext([
      unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-05" }),
    ]);
    const draftCommandState = commandState([
      {
        scopeMonth: "2026-08",
        command: {
          id: "cmd-a",
          sequence: 1,
          kind: "move_item",
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-08-07",
        },
      },
      {
        scopeMonth: "2026-08",
        command: {
          id: "cmd-b",
          sequence: 2,
          kind: "move_item",
          goalId: "goal-z",
          unitKey: "total:9",
          scheduledDate: "2026-08-09",
        },
      },
    ]);

    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: context.preview,
      currentScopeMonth: "2026-08",
      draftCommandState,
      visibleMonthContexts: {},
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    expect(projection.effectiveDraftCommands).toHaveLength(1);
    expect(projection.effectiveDraftItemEdits["goal-a:total:1"]).toEqual({
      scheduledDate: "2026-08-07",
    });
    expect(projection.entriesByDate.get("2026-08-07")?.[0]?.key).toBe(
      "goal-a:total:1"
    );
  });

  it("builds and reads day projections with pinned ordering", () => {
    const day = "2026-08-07";
    const entryA: PlannerDayDetailEntry = {
      key: "goal-a:total:1",
      originalGoalId: "goal-a",
      goalTitle: "Goal A",
      unitKey: "total:1",
      label: "A",
      classification: "planned",
      creditState: "uncredited",
      activeGoal: null,
      activeItem: null,
      draftDiffKind: null,
      draftDiffFromDate: null,
      draftDiffToDate: null,
      draftGhost: false,
    };
    const entryB: PlannerDayDetailEntry = {
      key: "goal-b:total:1",
      originalGoalId: "goal-b",
      goalTitle: "Goal B",
      unitKey: "total:1",
      label: "B",
      classification: "planned",
      creditState: "uncredited",
      activeGoal: null,
      activeItem: null,
      draftDiffKind: null,
      draftDiffFromDate: null,
      draftDiffToDate: null,
      draftGhost: false,
    };

    const storeProjection: PlannerCalendarStoreProjection = {
      effectiveDraftCommands: [],
      effectiveDraftItemEdits: {},
      visibleDraftItemEditsByMonth: {},
      visibleMonthCalendarDataByMonth: new Map(),
      entriesByDate: new Map([[day, [entryA, entryB]]]),
      entryByKey: new Map([
        [entryA.key, entryA],
        [entryB.key, entryB],
      ]),
      entryDayByKey: new Map([
        [entryA.key, day],
        [entryB.key, day],
      ]),
      scopeOwnedEntryKeys: new Set([entryA.key, entryB.key]),
      previewUnitByEntryKey: new Map([
        [
          entryA.key,
          unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: day }),
        ],
        [
          entryB.key,
          unit({ goalId: "goal-b", unitKey: "total:1", scheduledDate: day }),
        ],
      ]),
      completionFactUnitsByGoalDate: new Map(),
      completionFactMarkersByDate: new Map(),
      completionFactMarkerDayByIdentity: new Map(),
    };

    const projectionByDay = selectPlannerCalendarDayProjectionsByDay({
      days: [day],
      storeProjection,
      previewEntryOrderByDay: {
        [day]: [entryB.key, entryA.key],
      },
    });

    const dayProjection = readPlannerCalendarDayProjection(projectionByDay, day);
    expect(dayProjection.orderedEntries.map((entry) => entry.key)).toEqual([
      entryB.key,
      entryA.key,
    ]);
    expect(readPlannerCalendarDayProjection(projectionByDay, null).entries).toEqual([]);
  });

  it("warns in non-production when reading an unprojected day", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const projectionByDay = new Map<string, PlannerCalendarDayProjection>();
    const missingDay = "2099-12-31";
    const dayProjection = readPlannerCalendarDayProjection(projectionByDay, missingDay);
    expect(dayProjection.entries).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      `[planner] Missing day projection for ${missingDay}. Verify projectionDays includes every rendered/accessed day.`
    );
    warnSpy.mockRestore();
  });
});
