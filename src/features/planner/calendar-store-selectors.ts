import {
  buildCompletionFactMarkersByDate,
  buildCompletionFactUnitsByGoalDate,
  buildEntriesByDateProjection,
  buildPreviewUnitByEntryKey,
  orderEntriesForDay,
  resolveCalendarDayData,
} from "@/features/planner/calendar-entries";
import type {
  DraftItemEdit,
  PlannerActiveGoalSnapshot,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  selectDraftCommands,
  type DraftCommandState,
} from "@/features/planner/draft-command-reducer";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { summarizePlannerGoalUnplaceableRecords } from "@/lib/planner/unplaceable";

export interface PlannerCalendarStoreProjection {
  effectiveDraftCommands: PlannerDraftCommand[];
  effectiveDraftItemEdits: Record<string, DraftItemEdit>;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  previewUnitByEntryKey: Map<string, PlannerWorkUnit>;
  completionFactUnitsByGoalDate: Map<string, PlannerWorkUnit[]>;
  completionFactMarkersByDate: Map<string, PlannerCompletionFactMarker[]>;
  unplaceableGoalSummaries: Array<{
    goalId: string;
    title: string;
    unplacedCount: number;
    reason: "capacity" | "invalid_lock";
  }>;
  totalUnplacedCount: number;
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

export function selectPlannerCalendarStoreProjection({
  context,
  effectivePreview,
  draftCommandState,
  activeGoalsByPlanGoalId,
  activeGoalsByOriginalGoalId,
}: {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  draftCommandState: DraftCommandState;
  activeGoalsByPlanGoalId: Map<string, PlannerActiveGoalSnapshot>;
  activeGoalsByOriginalGoalId: Map<string, PlannerActiveGoalSnapshot>;
}): PlannerCalendarStoreProjection {
  const effectiveDraftCommands = sortPlannerDraftCommands(
    selectDraftCommands(draftCommandState)
  );
  const effectiveDraftItemEdits = projectPlannerDraftCommands(
    effectiveDraftCommands
  ) as Record<string, DraftItemEdit>;
  const {
    entriesByDate,
    entryByKey,
    entryDayByKey,
  } = buildEntriesByDateProjection({
    workUnits: effectivePreview?.workUnits,
    activeItems: context?.activePlan?.items,
    activeGoalsByPlanGoalId,
    activeGoalsByOriginalGoalId,
    goalTitles: context?.goalTitles,
    draftItemEdits: effectiveDraftItemEdits,
    draftCommands: effectiveDraftCommands,
  });
  const previewUnitByEntryKey = buildPreviewUnitByEntryKey(effectivePreview?.workUnits);
  const completionFactUnitsByGoalDate = buildCompletionFactUnitsByGoalDate(
    effectivePreview?.workUnits
  );
  const completionFactMarkersByDate = buildCompletionFactMarkersByDate({
    workUnits: effectivePreview?.workUnits,
    activeGoalsByOriginalGoalId,
    goalTitles: context?.goalTitles,
  });
  const unplaceableGoalSummaries = summarizePlannerGoalUnplaceableRecords({
    records: context?.unplaceableGoals ?? [],
    goalTitles: context?.goalTitles ?? {},
  });
  return {
    effectiveDraftCommands,
    effectiveDraftItemEdits,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    previewUnitByEntryKey,
    completionFactUnitsByGoalDate,
    completionFactMarkersByDate,
    unplaceableGoalSummaries,
    totalUnplacedCount: unplaceableGoalSummaries.reduce(
      (count, entry) => count + entry.unplacedCount,
      0
    ),
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
      completionFactMarkersByDate: storeProjection.completionFactMarkersByDate,
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
