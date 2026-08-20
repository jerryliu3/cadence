import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import {
  applyCalendarCompletionMarkerFilters,
  buildCalendarCategoryFilterOptions,
  entryMatchesCalendarSearchQuery,
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

export interface CalendarDayAccessorsArgs {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  draftCommandState: DraftCommandState;
  month: string | null;
  currentScopeMonth: string | null;
  calendarToday: string;
  categoryFilter: string;
  endMonthFilter: string | null;
  searchQuery?: string;
  duoScope: "me" | "partner" | "both";
  partnerCompletionMarkersByDate?: Map<string, PlannerCompletionFactMarker[]>;
  visibleDays: string[];
  additionalProjectionDays: string[];
  previewEntryOrderByDay: Record<string, string[]>;
}

export interface CalendarDayAccessorsMemoizedState {
  activeGoalIndexes?: ReturnType<typeof buildActiveGoalIndexes>;
  calendarStoreProjection?: PlannerCalendarStoreProjection;
}

export interface CalendarDayAccessorsResult {
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
  getEntriesForDay: (day: string | null) => PlannerDayDetailEntry[];
  getCompletionFactMarkersForDay: (
    day: string | null
  ) => PlannerCompletionFactMarker[];
  getOrderedEntriesForDay: (day: string | null) => PlannerDayDetailEntry[];
  canMutateEntryOnDay: (entry: PlannerDayDetailEntry, day: string | null) => boolean;
  hideViewerPlan: boolean;
  plannerReadOnly: boolean;
}

export function selectCalendarDayAccessorsModel({
  context,
  effectivePreview,
  draftCommandState,
  month,
  currentScopeMonth,
  calendarToday,
  categoryFilter,
  endMonthFilter,
  searchQuery = "",
  duoScope,
  partnerCompletionMarkersByDate,
  visibleDays,
  additionalProjectionDays,
  previewEntryOrderByDay,
  memoizedState,
}: CalendarDayAccessorsArgs & {
  memoizedState?: CalendarDayAccessorsMemoizedState;
}): CalendarDayAccessorsResult {
  const activeGoalIndexes =
    memoizedState?.activeGoalIndexes ??
    buildActiveGoalIndexes(context?.activePlan?.goals);
  const activeGoalsByPlanGoalId = activeGoalIndexes.byPlanGoalId;
  const activeGoalsByOriginalGoalId = activeGoalIndexes.byOriginalGoalId;
  const filterReferenceMonth = currentScopeMonth ?? calendarToday.slice(0, 7);
  const effectiveEndMonthFilter = resolveEffectiveEndMonth(
    endMonthFilter,
    filterReferenceMonth
  );

  const categoryOptions = buildCalendarCategoryFilterOptions(activeGoalsByOriginalGoalId);
  const endMonthOptions = (() => {
    const goalEndDates = Array.from(activeGoalsByOriginalGoalId.values()).map(
      (goal) => goal.end_date
    );
    return buildGoalEndMonthOptions(
      goalEndDates,
      filterReferenceMonth,
      effectiveEndMonthFilter ? [effectiveEndMonthFilter] : []
    );
  })();

  const goalPassesFilters = (goalId: string) =>
    goalPassesCalendarFilters({
      goalId,
      goalsByOriginalId: activeGoalsByOriginalGoalId,
      categoryFilter,
      allCategoriesValue,
      endMonthFilter: effectiveEndMonthFilter,
    });

  const calendarStoreProjection =
    memoizedState?.calendarStoreProjection ??
    selectPlannerCalendarStoreProjection({
      context,
      effectivePreview,
      draftCommandState,
      activeGoalsByPlanGoalId,
      activeGoalsByOriginalGoalId,
    });

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

  const projectionDays = (() => {
    const days = new Set<string>(visibleDays);
    for (const day of additionalProjectionDays) {
      if (day) {
        days.add(day);
      }
    }
    return Array.from(days);
  })();

  const dayProjectionByDay = selectPlannerCalendarDayProjectionsByDay({
    days: projectionDays,
    storeProjection: calendarStoreProjection,
    previewEntryOrderByDay,
  });

  const getCalendarDayProjection = (day: string | null): PlannerCalendarDayProjection =>
    readPlannerCalendarDayProjection(dayProjectionByDay, day);

  const isDayInCurrentScopeMonth = (day: string | null) => {
    if (!day || !month) {
      return false;
    }
    return day.slice(0, 7) === month;
  };

  const canMutateEntryOnDay = (entry: PlannerDayDetailEntry, day: string | null) => {
    if (!day) {
      return false;
    }
    if (isDayInCurrentScopeMonth(day)) {
      return true;
    }
    return entryDayByKey.get(entry.key) === day;
  };

  const hideViewerPlan = duoScope === "partner";
  const plannerReadOnly = duoScope === "partner";

  const filterEntries = (entries: PlannerDayDetailEntry[]) =>
    entries.filter(
      (entry) =>
        goalPassesFilters(entry.originalGoalId) &&
        entryMatchesCalendarSearchQuery(entry, searchQuery)
    );

  const getEntriesForDay = (day: string | null) => {
    if (hideViewerPlan) {
      return [];
    }
    return filterEntries(getCalendarDayProjection(day).entries);
  };

  const getCompletionFactMarkersForDay = (day: string | null) => {
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
      searchQuery,
    });
  };

  const getOrderedEntriesForDay = (day: string | null) => {
    if (hideViewerPlan) {
      return [];
    }
    return filterEntries(getCalendarDayProjection(day).orderedEntries);
  };

  return {
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
    getEntriesForDay,
    getCompletionFactMarkersForDay,
    getOrderedEntriesForDay,
    canMutateEntryOnDay,
    hideViewerPlan,
    plannerReadOnly,
  };
}
