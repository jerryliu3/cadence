"use client";

import { useCallback, useMemo } from "react";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import {
  applyCalendarCompletionMarkerFilters,
  buildCalendarCategoryFilterOptions,
  goalPassesCalendarFilters,
} from "@/features/planner/calendar-filters";
import {
  readPlannerCalendarDayProjection,
  selectPlannerCalendarDayProjectionsByDay,
  selectPlannerCalendarStoreProjection,
} from "@/features/planner/calendar-store-selectors";
import type {
  PlannerCalendarStoreProjection,
  PlannerCalendarDayProjection,
} from "@/features/planner/calendar-store-selectors";
import type {
  PlannerCompletionFactMarker,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { DraftCommandState } from "@/features/planner/draft-command-reducer";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import {
  buildGoalEndMonthOptions,
  resolveEffectiveEndMonth,
} from "@/lib/goals/list-view";

interface UseCalendarDayAccessorsArgs {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  draftCommandState: DraftCommandState;
  month: string | null;
  currentScopeMonth: string | null;
  calendarToday: string;
  categoryFilter: string;
  endMonthFilter: string | null;
  duoScope: "me" | "partner" | "both";
  partnerCompletionMarkersByDate?: Map<string, PlannerCompletionFactMarker[]>;
  visibleDays: string[];
  focusedDay: string;
  dayPreviewDay: string | null;
  expandedPreviewDay: string | null;
  moveDialogDay: string | null;
  localSelectedDay: string | null;
  selectedEventEntryKey: string | null;
  previewEntryOrderByDay: Record<string, string[]>;
  draftWindowUnitByEntryKey: Map<string, NonNullable<PlannerContextPayload["preview"]>["workUnits"][number]>;
}

export interface CalendarDayAccessorsResult {
  calendarStoreProjection: PlannerCalendarStoreProjection;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  effectiveDraftItemEdits: PlannerCalendarStoreProjection["effectiveDraftItemEdits"];
  unplaceableGoalSummaries: PlannerCalendarStoreProjection["unplaceableGoalSummaries"];
  totalUnplacedCount: number;
  invalidLockGoalCount: number;
  capacityWarningGoalCount: number;
  categoryOptions: ReturnType<typeof buildCalendarCategoryFilterOptions>;
  endMonthOptions: ReturnType<typeof buildGoalEndMonthOptions>;
  effectiveEndMonthFilter: string | null;
  goalPassesFilters: (goalId: string) => boolean;
  getEntriesForDay: (day: string | null) => PlannerDayDetailEntry[];
  getCompletionFactMarkersForDay: (
    day: string | null
  ) => PlannerCompletionFactMarker[];
  getOrderedEntriesForDay: (day: string | null) => PlannerDayDetailEntry[];
  isDayInCurrentScopeMonth: (day: string | null) => boolean;
  canMutateEntryOnDay: (entry: PlannerDayDetailEntry, day: string | null) => boolean;
  hideViewerPlan: boolean;
  plannerReadOnly: boolean;
  effectiveSelectedDay: string | null;
  selectedEventEntry: PlannerDayDetailEntry | null;
  selectedEventDraftEdit:
    | PlannerCalendarStoreProjection["effectiveDraftItemEdits"][string]
    | undefined;
  selectedEventBaselineUnit:
    | NonNullable<PlannerContextPayload["preview"]>["workUnits"][number]
    | null;
  selectedEventDraftScheduledDate: string | null;
  selectedEventDraftTimeInputValue: string;
  focusedDayEntries: PlannerDayDetailEntry[];
  focusedDayCompletionFactMarkers: PlannerCompletionFactMarker[];
  previewDayEntries: PlannerDayDetailEntry[];
  previewDayCompletionFactMarkers: PlannerCompletionFactMarker[];
  expandedPreviewEntries: PlannerDayDetailEntry[];
  expandedPreviewCompletionFactMarkers: PlannerCompletionFactMarker[];
  moveDialogEntriesForTargetDay: PlannerDayDetailEntry[];
}

export function useCalendarDayAccessors({
  context,
  effectivePreview,
  draftCommandState,
  month,
  currentScopeMonth,
  calendarToday,
  categoryFilter,
  endMonthFilter,
  duoScope,
  partnerCompletionMarkersByDate,
  visibleDays,
  focusedDay,
  dayPreviewDay,
  expandedPreviewDay,
  moveDialogDay,
  localSelectedDay,
  selectedEventEntryKey,
  previewEntryOrderByDay,
  draftWindowUnitByEntryKey,
}: UseCalendarDayAccessorsArgs): CalendarDayAccessorsResult {
  const activeGoalIndexes = useMemo(
    () => buildActiveGoalIndexes(context?.activePlan?.goals),
    [context?.activePlan?.goals]
  );
  const activeGoalsByPlanGoalId = activeGoalIndexes.byPlanGoalId;
  const activeGoalsByOriginalGoalId = activeGoalIndexes.byOriginalGoalId;
  const filterReferenceMonth = currentScopeMonth ?? calendarToday.slice(0, 7);
  const effectiveEndMonthFilter = resolveEffectiveEndMonth(
    endMonthFilter,
    filterReferenceMonth
  );

  const categoryOptions = useMemo(
    () => buildCalendarCategoryFilterOptions(activeGoalsByOriginalGoalId),
    [activeGoalsByOriginalGoalId]
  );
  const endMonthOptions = useMemo(() => {
    const goalEndDates = Array.from(activeGoalsByOriginalGoalId.values()).map(
      (goal) => goal.end_date
    );
    return buildGoalEndMonthOptions(
      goalEndDates,
      filterReferenceMonth,
      effectiveEndMonthFilter ? [effectiveEndMonthFilter] : []
    );
  }, [activeGoalsByOriginalGoalId, effectiveEndMonthFilter, filterReferenceMonth]);

  const goalPassesFilters = useCallback(
    (goalId: string) =>
      goalPassesCalendarFilters({
        goalId,
        goalsByOriginalId: activeGoalsByOriginalGoalId,
        categoryFilter,
        allCategoriesValue,
        endMonthFilter: effectiveEndMonthFilter,
      }),
    [activeGoalsByOriginalGoalId, categoryFilter, effectiveEndMonthFilter]
  );

  const calendarStoreProjection = useMemo(
    () =>
      selectPlannerCalendarStoreProjection({
        context,
        effectivePreview,
        draftCommandState,
        activeGoalsByPlanGoalId,
        activeGoalsByOriginalGoalId,
      }),
    [
      activeGoalsByOriginalGoalId,
      activeGoalsByPlanGoalId,
      context,
      draftCommandState,
      effectivePreview,
    ]
  );

  const {
    effectiveDraftItemEdits,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    unplaceableGoalSummaries,
    totalUnplacedCount,
  } = calendarStoreProjection;

  const invalidLockGoalCount = unplaceableGoalSummaries.filter(
    (entry) => entry.reason === "invalid_lock"
  ).length;
  const capacityWarningGoalCount = unplaceableGoalSummaries.filter(
    (entry) => entry.reason === "capacity"
  ).length;

  const effectiveSelectedDay = localSelectedDay;
  const projectionDays = useMemo(() => {
    const days = new Set<string>();
    for (const day of visibleDays) {
      days.add(day);
    }
    if (effectiveSelectedDay) {
      days.add(effectiveSelectedDay);
    }
    if (focusedDay) {
      days.add(focusedDay);
    }
    if (dayPreviewDay) {
      days.add(dayPreviewDay);
    }
    return Array.from(days);
  }, [dayPreviewDay, effectiveSelectedDay, focusedDay, visibleDays]);

  const dayProjectionByDay = useMemo(
    () =>
      selectPlannerCalendarDayProjectionsByDay({
        days: projectionDays,
        storeProjection: calendarStoreProjection,
        previewEntryOrderByDay,
      }),
    [calendarStoreProjection, previewEntryOrderByDay, projectionDays]
  );

  const getCalendarDayProjection = useCallback(
    (day: string | null): PlannerCalendarDayProjection =>
      readPlannerCalendarDayProjection(dayProjectionByDay, day),
    [dayProjectionByDay]
  );

  const isDayInCurrentScopeMonth = useCallback(
    (day: string | null) => {
      if (!day || !month) {
        return false;
      }
      return day.slice(0, 7) === month;
    },
    [month]
  );

  const canMutateEntryOnDay = useCallback(
    (entry: PlannerDayDetailEntry, day: string | null) => {
      if (!day) {
        return false;
      }
      if (isDayInCurrentScopeMonth(day)) {
        return true;
      }
      return entryDayByKey.get(entry.key) === day;
    },
    [entryDayByKey, isDayInCurrentScopeMonth]
  );

  const hideViewerPlan = duoScope === "partner";
  const plannerReadOnly = duoScope === "partner";

  const filterEntries = useCallback(
    (entries: PlannerDayDetailEntry[]) =>
      entries.filter((entry) => goalPassesFilters(entry.originalGoalId)),
    [goalPassesFilters]
  );

  const getEntriesForDay = useCallback(
    (day: string | null) => {
      if (hideViewerPlan) {
        return [];
      }
      return filterEntries(getCalendarDayProjection(day).entries);
    },
    [filterEntries, getCalendarDayProjection, hideViewerPlan]
  );

  const getCompletionFactMarkersForDay = useCallback(
    (day: string | null) => {
      const viewerMarkers = hideViewerPlan
        ? []
        : getCalendarDayProjection(day).completionFactMarkers;
      const partnerMarkers =
        day && (duoScope === "partner" || duoScope === "both")
          ? partnerCompletionMarkersByDate?.get(day) ?? []
          : [];
      return applyCalendarCompletionMarkerFilters({
        viewerMarkers,
        partnerMarkers,
        goalPassesFilters,
      });
    },
    [
      duoScope,
      getCalendarDayProjection,
      goalPassesFilters,
      hideViewerPlan,
      partnerCompletionMarkersByDate,
    ]
  );

  const getOrderedEntriesForDay = useCallback(
    (day: string | null) => {
      if (hideViewerPlan) {
        return [];
      }
      return filterEntries(getCalendarDayProjection(day).orderedEntries);
    },
    [filterEntries, getCalendarDayProjection, hideViewerPlan]
  );

  const focusedDayEntries = useMemo(
    () => getOrderedEntriesForDay(focusedDay),
    [focusedDay, getOrderedEntriesForDay]
  );
  const focusedDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(focusedDay),
    [focusedDay, getCompletionFactMarkersForDay]
  );
  const previewDayEntries = useMemo(
    () => getOrderedEntriesForDay(dayPreviewDay),
    [dayPreviewDay, getOrderedEntriesForDay]
  );
  const previewDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(dayPreviewDay),
    [dayPreviewDay, getCompletionFactMarkersForDay]
  );
  const expandedPreviewEntries = useMemo(
    () => getOrderedEntriesForDay(expandedPreviewDay),
    [expandedPreviewDay, getOrderedEntriesForDay]
  );
  const expandedPreviewCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(expandedPreviewDay),
    [expandedPreviewDay, getCompletionFactMarkersForDay]
  );
  const moveDialogEntriesForTargetDay = useMemo(
    () => getOrderedEntriesForDay(moveDialogDay),
    [getOrderedEntriesForDay, moveDialogDay]
  );

  const selectedEventEntry = useMemo(
    () =>
      selectedEventEntryKey ? entryByKey.get(selectedEventEntryKey) ?? null : null,
    [entryByKey, selectedEventEntryKey]
  );
  const selectedEventDraftEdit = selectedEventEntry
    ? effectiveDraftItemEdits[selectedEventEntry.key]
    : undefined;
  const selectedEventBaselineUnit = selectedEventEntry
    ? draftWindowUnitByEntryKey.get(selectedEventEntry.key) ?? null
    : null;
  const selectedEventDraftScheduledDate =
    selectedEventDraftEdit?.scheduledDate ??
    selectedEventEntry?.activeItem?.scheduled_date ??
    effectiveSelectedDay ??
    null;
  const selectedEventDraftTimeInputValue =
    selectedEventDraftEdit?.scheduledTimeOverride === null
      ? ""
      : selectedEventDraftEdit?.scheduledTimeOverride ??
        selectedEventBaselineUnit?.scheduledTimeOverride ??
        "";

  return {
    calendarStoreProjection,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    effectiveDraftItemEdits,
    unplaceableGoalSummaries,
    totalUnplacedCount,
    invalidLockGoalCount,
    capacityWarningGoalCount,
    categoryOptions,
    endMonthOptions,
    effectiveEndMonthFilter,
    goalPassesFilters,
    getEntriesForDay,
    getCompletionFactMarkersForDay,
    getOrderedEntriesForDay,
    isDayInCurrentScopeMonth,
    canMutateEntryOnDay,
    hideViewerPlan,
    plannerReadOnly,
    effectiveSelectedDay,
    selectedEventEntry,
    selectedEventDraftEdit,
    selectedEventBaselineUnit,
    selectedEventDraftScheduledDate,
    selectedEventDraftTimeInputValue,
    focusedDayEntries,
    focusedDayCompletionFactMarkers,
    previewDayEntries,
    previewDayCompletionFactMarkers,
    expandedPreviewEntries,
    expandedPreviewCompletionFactMarkers,
    moveDialogEntriesForTargetDay,
  };
}
