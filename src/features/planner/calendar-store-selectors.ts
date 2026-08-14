import {
  buildCompletionFactMarkerDayByIdentity,
  buildCompletionFactMarkersByDate,
  buildCompletionFactUnitsByGoalDate,
  buildEntriesByDateProjection,
  buildPreviewUnitByEntryKey,
  buildScopeOwnedEntryKeys,
  buildVisibleMonthCalendarDataByMonth,
  orderEntriesForDay,
  resolveCalendarDayData,
} from "@/features/planner/calendar-entries";
import type {
  DraftItemEdit,
  PlannerActiveGoalSnapshot,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerVisibleMonthContextPayload,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  selectDraftCommands,
  type DraftCommandState,
} from "@/features/planner/draft-command-reducer";
import {
  draftCommandEntryKey,
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export type VisibleMonthCalendarDataByMonth = ReturnType<
  typeof buildVisibleMonthCalendarDataByMonth
>;

export interface PlannerCalendarStoreProjection {
  effectiveDraftCommands: PlannerDraftCommand[];
  effectiveDraftItemEdits: Record<string, DraftItemEdit>;
  visibleDraftItemEditsByMonth: Record<string, Record<string, DraftItemEdit>>;
  visibleMonthCalendarDataByMonth: VisibleMonthCalendarDataByMonth;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  scopeOwnedEntryKeys: ReadonlySet<string>;
  previewUnitByEntryKey: Map<string, PlannerWorkUnit>;
  completionFactUnitsByGoalDate: Map<string, PlannerWorkUnit[]>;
  completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>;
  completionFactMarkerDayByIdentity: Map<string, string>;
}

export interface PlannerCalendarDayProjection {
  entries: PlannerDayDetailEntry[];
  completionFactMarkers: PlannerCompletionFactMarker[];
  orderedEntries: PlannerDayDetailEntry[];
}

const EMPTY_DAY_ENTRIES: PlannerDayDetailEntry[] = [];
const EMPTY_COMPLETION_FACT_MARKERS: PlannerCompletionFactMarker[] = [];
const warnedMissingDayProjectionByMap = new WeakMap<
  Map<string, PlannerCalendarDayProjection>,
  Set<string>
>();

export const EMPTY_PLANNER_CALENDAR_DAY_PROJECTION: PlannerCalendarDayProjection = {
  entries: EMPTY_DAY_ENTRIES,
  completionFactMarkers: EMPTY_COMPLETION_FACT_MARKERS,
  orderedEntries: EMPTY_DAY_ENTRIES,
};

export function buildPreviewEntryKeySet(
  workUnits: PlannerWorkUnit[] | undefined | null
) {
  return new Set(
    (workUnits ?? []).map((unit) =>
      draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      })
    )
  );
}

export function selectDraftCommandsForPreviewEntries({
  commands,
  previewEntryKeys,
}: {
  commands: PlannerDraftCommand[];
  previewEntryKeys: Set<string>;
}) {
  if (commands.length === 0 || previewEntryKeys.size === 0) {
    return [] as PlannerDraftCommand[];
  }
  return sortPlannerDraftCommands(commands).filter((command) =>
    previewEntryKeys.has(draftCommandEntryKey(command))
  );
}

export function selectEffectiveDraftCommands({
  draftCommandState,
  scopeMonth,
  previewWorkUnits,
}: {
  draftCommandState: DraftCommandState;
  scopeMonth: string | null;
  previewWorkUnits: PlannerWorkUnit[] | undefined | null;
}) {
  return selectDraftCommandsForPreviewEntries({
    commands: selectDraftCommands(draftCommandState),
    previewEntryKeys: buildPreviewEntryKeySet(previewWorkUnits),
  });
}

export function selectVisibleDraftItemEditsByMonth({
  draftCommandState,
  visibleMonthContexts,
}: {
  draftCommandState: DraftCommandState;
  visibleMonthContexts: Record<string, PlannerVisibleMonthContextPayload>;
}) {
  const allCommands = selectDraftCommands(draftCommandState);
  const itemEditsByMonth: Record<string, Record<string, DraftItemEdit>> = {};
  for (const [visibleMonth, visibleMonthContext] of Object.entries(
    visibleMonthContexts
  )) {
    const scopedCommands = selectDraftCommandsForPreviewEntries({
      commands: allCommands,
      previewEntryKeys: new Set([
        ...buildPreviewEntryKeySet(visibleMonthContext.preview?.workUnits),
        ...allCommands
          .filter(
            (command) =>
              command.kind === "move_item" &&
              command.scheduledDate?.startsWith(visibleMonth)
          )
          .map((command) => draftCommandEntryKey(command)),
      ]),
    });
    if (scopedCommands.length === 0) {
      continue;
    }
    itemEditsByMonth[visibleMonth] = projectPlannerDraftCommands(
      scopedCommands
    ) as Record<string, DraftItemEdit>;
  }
  return itemEditsByMonth;
}

export function selectPlannerCalendarStoreProjection({
  context,
  effectivePreview,
  currentScopeMonth,
  draftCommandState,
  visibleMonthContexts,
  activeGoalsByPlanGoalId,
  activeGoalsByOriginalGoalId,
}: {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  currentScopeMonth: string | null;
  draftCommandState: DraftCommandState;
  visibleMonthContexts: Record<string, PlannerVisibleMonthContextPayload>;
  activeGoalsByPlanGoalId: Map<string, PlannerActiveGoalSnapshot>;
  activeGoalsByOriginalGoalId: Map<string, PlannerActiveGoalSnapshot>;
}): PlannerCalendarStoreProjection {
  const effectiveDraftCommands = selectEffectiveDraftCommands({
    draftCommandState,
    scopeMonth: currentScopeMonth,
    previewWorkUnits: effectivePreview?.workUnits,
  });
  const effectiveDraftItemEdits = projectPlannerDraftCommands(
    effectiveDraftCommands
  ) as Record<string, DraftItemEdit>;
  const visibleDraftItemEditsByMonth = selectVisibleDraftItemEditsByMonth({
    draftCommandState,
    visibleMonthContexts,
  });
  const visibleMonthCalendarDataByMonth = buildVisibleMonthCalendarDataByMonth(
    visibleMonthContexts,
    visibleDraftItemEditsByMonth
  );
  const {
    entriesByDate,
    entryByKey,
    entryDayByKey,
  } = buildEntriesByDateProjection({
    baselineWorkUnits: context?.preview?.workUnits,
    workUnits: effectivePreview?.workUnits,
    activeItems: context?.activePlan?.items,
    activeGoalsByPlanGoalId,
    activeGoalsByOriginalGoalId,
    goalTitles: context?.goalTitles,
    draftItemEdits: effectiveDraftItemEdits,
  });
  const scopeOwnedEntryKeys = buildScopeOwnedEntryKeys(effectivePreview?.workUnits);
  const previewUnitByEntryKey = buildPreviewUnitByEntryKey(effectivePreview?.workUnits);
  const completionFactUnitsByGoalDate = buildCompletionFactUnitsByGoalDate(
    effectivePreview?.workUnits
  );
  const completionFactMarkersByDate = buildCompletionFactMarkersByDate({
    workUnits: effectivePreview?.workUnits,
    activeGoalsByOriginalGoalId,
    goalTitles: context?.goalTitles,
  });
  const completionFactMarkerDayByIdentity = buildCompletionFactMarkerDayByIdentity(
    completionFactMarkersByDate
  );
  return {
    effectiveDraftCommands,
    effectiveDraftItemEdits,
    visibleDraftItemEditsByMonth,
    visibleMonthCalendarDataByMonth,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    scopeOwnedEntryKeys,
    previewUnitByEntryKey,
    completionFactUnitsByGoalDate,
    completionFactMarkersByDate,
    completionFactMarkerDayByIdentity,
  };
}

export function selectPlannerCalendarDayProjectionsByDay({
  days,
  storeProjection,
  previewEntryOrderByDay,
}: {
  days: Array<string | null | undefined>;
  storeProjection: PlannerCalendarStoreProjection;
  previewEntryOrderByDay: Record<string, string[]>;
}) {
  const projectionByDay = new Map<string, PlannerCalendarDayProjection>();
  const uniqueDays = new Set(
    days.filter((day): day is string => typeof day === "string" && day.length > 0)
  );
  for (const day of uniqueDays) {
    const dayData = resolveCalendarDayData({
      day,
      entriesByDate: storeProjection.entriesByDate,
      scopeOwnedEntryKeys: storeProjection.scopeOwnedEntryKeys,
      entryDayByKey: storeProjection.entryDayByKey,
      completionFactMarkersByDate: storeProjection.completionFactMarkersByDate,
      completionFactMarkerDayByIdentity:
        storeProjection.completionFactMarkerDayByIdentity,
      visibleMonthCalendarDataByMonth: storeProjection.visibleMonthCalendarDataByMonth,
    });
    projectionByDay.set(day, {
      entries: dayData.entries,
      completionFactMarkers: dayData.completionFactMarkers,
      orderedEntries: orderEntriesForDay({
        day,
        entries: dayData.entries,
        previewEntryOrderByDay,
      }),
    });
  }
  return projectionByDay;
}

export function readPlannerCalendarDayProjection(
  dayProjectionByDay: Map<string, PlannerCalendarDayProjection>,
  day: string | null | undefined
) {
  if (!day) {
    return EMPTY_PLANNER_CALENDAR_DAY_PROJECTION;
  }
  if (process.env.NODE_ENV !== "production" && !dayProjectionByDay.has(day)) {
    const warnedDays =
      warnedMissingDayProjectionByMap.get(dayProjectionByDay) ?? new Set<string>();
    if (!warnedMissingDayProjectionByMap.has(dayProjectionByDay)) {
      warnedMissingDayProjectionByMap.set(dayProjectionByDay, warnedDays);
    }
    if (!warnedDays.has(day)) {
      warnedDays.add(day);
      console.warn(
        `[planner] Missing day projection for ${day}. Verify projectionDays includes every rendered/accessed day.`
      );
    }
  }
  return (
    dayProjectionByDay.get(day) ?? EMPTY_PLANNER_CALENDAR_DAY_PROJECTION
  );
}
