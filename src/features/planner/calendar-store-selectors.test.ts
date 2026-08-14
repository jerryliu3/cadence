import { describe, expect, it, vi } from "vitest";
import type { DraftCommandState } from "@/features/planner/draft-command-reducer";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  buildPlannerContext,
  buildPlannerDayEntry,
  buildPlannerPreview,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";
import {
  readPlannerCalendarDayProjection,
  selectPlannerCalendarDayProjectionsByDay,
  selectPlannerCalendarStoreProjection,
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
  return buildPlannerWorkUnit({
    originalGoalId: goalId,
    unitKey,
    label: null,
    scheduledDate,
    classification: "open",
    creditState: "uncredited",
  });
}

function buildPreview(workUnits: PlannerWorkUnit[]): NonNullable<PlannerContextPayload["preview"]> {
  return buildPlannerPreview(workUnits, {
    preserveExistingAssignments: true,
  });
}

function buildContext(workUnits: PlannerWorkUnit[]): PlannerContextPayload {
  const goalIds = Array.from(new Set(workUnits.map((unit) => unit.originalGoalId)));
  return buildPlannerContext({
    workUnits,
    overrides: {
      asOfDate: "2026-08-15",
      goalTitles: {
        "goal-a": "Goal A",
        "goal-b": "Goal B",
        "goal-c": "Goal C",
      },
      preferences: null,
      activePlan: {
        plan: { id: "plan", version: 1, status: "active" },
        goals: goalIds.map((goalId) => ({
          id: goalId,
          goal_id: goalId,
          original_goal_id: goalId,
          requirement_fingerprint: "a".repeat(64),
          title: goalId,
          category: "Personal",
          color: null,
        })),
        items: workUnits.flatMap((workUnit, index) =>
          workUnit.scheduledDate
            ? [{
                id: `item-${index}`,
                plan_goal_id: workUnit.originalGoalId,
                unit_key: workUnit.unitKey,
                requirement_kind: "deadline_total" as const,
                scheduled_date: workUnit.scheduledDate,
                original_scheduled_date: workUnit.scheduledDate,
                classification: workUnit.classification,
                credit_state: workUnit.creditState,
                locked: false,
                revision: 0,
                credited_completion_id: null,
                credited_completion_date: null,
              }]
            : []
        ),
      },
      preview: buildPreview(workUnits),
      revisions: {
        canonicalRevision: 1,
        executionRevision: 1,
        scheduleDigest: "digest",
      },
    },
  });
}

function commandState(
  commands: DraftCommandState["commands"]
): DraftCommandState {
  return {
    commands,
    nextSequence: commands.length,
  };
}

describe("calendar store selectors", () => {
  it("builds planner store projection from persisted rows and explicit commands", () => {
    const context = buildContext([
      unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-05" }),
    ]);
    const draftCommandState = commandState([
      {
        id: "cmd-a",
        sequence: 1,
        kind: "move_item",
        goalId: "goal-a",
        unitKey: "total:1",
        scheduledDate: "2026-08-07",
        sourceDate: "2026-08-05",
      },
      {
        id: "cmd-b",
        sequence: 2,
        kind: "move_item",
        goalId: "goal-z",
        unitKey: "total:9",
        scheduledDate: "2026-08-09",
        sourceDate: "2026-08-09",
      },
    ]);

    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: context.preview,
      draftCommandState,
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    expect(projection.effectiveDraftCommands).toHaveLength(2);
    expect(projection.effectiveDraftItemEdits["goal-a:total:1"]).toEqual({
      scheduledDate: "2026-08-07",
    });
    expect(projection.entriesByDate.get("2026-08-07")?.[0]?.key).toBe(
      "goal-a:total:1"
    );
  });

  it("builds and reads day projections with pinned ordering", () => {
    const day = "2026-08-07";
    const entryA: PlannerDayDetailEntry = buildPlannerDayEntry({
      key: "goal-a:total:1",
      originalGoalId: "goal-a",
      goalTitle: "Goal A",
      unitKey: "total:1",
      label: "A",
      classification: "planned",
      creditState: "uncredited",
    });
    const entryB: PlannerDayDetailEntry = buildPlannerDayEntry({
      key: "goal-b:total:1",
      originalGoalId: "goal-b",
      goalTitle: "Goal B",
      unitKey: "total:1",
      label: "B",
      classification: "planned",
      creditState: "uncredited",
    });

    const storeProjection: PlannerCalendarStoreProjection = {
      effectiveDraftCommands: [],
      effectiveDraftItemEdits: {},
      entriesByDate: new Map([[day, [entryA, entryB]]]),
      entryByKey: new Map([
        [entryA.key, entryA],
        [entryB.key, entryB],
      ]),
      entryDayByKey: new Map([
        [entryA.key, day],
        [entryB.key, day],
      ]),
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
      unplaceableGoalSummaries: [],
      totalUnplacedCount: 0,
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

  it("does not mark an untouched loaded month as new when the draft window widens", () => {
    const augustUnit = unit({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-08-10",
    });
    const septemberUnit = unit({
      goalId: "goal-b",
      unitKey: "total:1",
      scheduledDate: "2026-09-08",
    });
    const context = buildContext([augustUnit, septemberUnit]);
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: buildPreview([augustUnit, septemberUnit]),
      draftCommandState: commandState([]),
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    const septemberEntries = projection.entriesByDate.get("2026-09-08") ?? [];
    expect(septemberEntries.map((entry) => entry.key)).toEqual(["goal-b:total:1"]);
    expect(septemberEntries[0]?.draftDiffKind).toBeNull();
  });

  it("does not cross out a loaded adjacent month during regular viewing", () => {
    const augustUnit = unit({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-08-10",
    });
    const septemberUnit = unit({
      goalId: "goal-b",
      unitKey: "total:1",
      scheduledDate: "2026-09-08",
    });
    const context = buildContext([augustUnit, septemberUnit]);
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: context.preview,
      draftCommandState: commandState([]),
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    expect(
      Array.from(projection.entriesByDate.values())
        .flat()
        .filter((entry) => entry.draftDiffKind === "moved_from")
    ).toEqual([]);
  });

  it("does not infer new markers for an untouched unloaded month", () => {
    const augustUnit = unit({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-08-10",
    });
    const novemberUnit = unit({
      goalId: "goal-c",
      unitKey: "total:1",
      scheduledDate: "2026-11-04",
    });
    const context = buildContext([augustUnit]);
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: buildPreview([augustUnit, novemberUnit]),
      draftCommandState: commandState([]),
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    const novemberEntries = projection.entriesByDate.get("2026-11-04") ?? [];
    expect(novemberEntries).toEqual([]);
  });

  it("marks exactly the source and destination from a cross-month move command", () => {
    const sourceUnit = unit({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-08-10",
    });
    const movedUnit = unit({
      goalId: "goal-a",
      unitKey: "total:1",
      scheduledDate: "2026-09-20",
    });
    const context = buildContext([sourceUnit]);
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: buildPreview([movedUnit]),
      draftCommandState: commandState([
        {
          id: "cmd-a",
          sequence: 1,
          kind: "move_item",
          goalId: "goal-a",
          unitKey: "total:1",
          sourceDate: "2026-08-10",
          scheduledDate: "2026-09-20",
        },
      ]),
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    expect(projection.entriesByDate.get("2026-08-10")?.[0]).toMatchObject({
      key: "goal-a:total:1:ghost:2026-08-10",
      draftDiffKind: "moved_from",
    });
    expect(projection.entriesByDate.get("2026-09-20")?.[0]).toMatchObject({
      key: "goal-a:total:1",
      draftDiffKind: "moved_to",
    });
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

  it("derives unplaceable summaries from durable planner state", () => {
    const context = buildContext([
      unit({ goalId: "goal-a", unitKey: "total:1", scheduledDate: "2026-08-05" }),
    ]);
    context.unplaceableGoals = [
      {
        goalId: "goal-a",
        requirementFingerprint: "a".repeat(64),
        policyRevision: 1,
        lockSignature: "lock-a",
        effectiveSpanEnd: "2027-07-31",
        unplacedCount: 3,
        reason: "capacity",
      },
    ];
    const projection = selectPlannerCalendarStoreProjection({
      context,
      effectivePreview: context.preview,
      draftCommandState: commandState([]),
      activeGoalsByPlanGoalId: new Map(),
      activeGoalsByOriginalGoalId: new Map(),
    });

    expect(projection.totalUnplacedCount).toBe(3);
    expect(projection.unplaceableGoalSummaries).toEqual([
      expect.objectContaining({
        goalId: "goal-a",
        title: "Goal A",
        unplacedCount: 3,
        reason: "capacity",
      }),
    ]);
  });
});
