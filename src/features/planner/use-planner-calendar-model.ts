"use client";

import { useMemo } from "react";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import { selectPlannerCalendarStoreProjection } from "@/features/planner/calendar-store-selectors";
import { selectPlannerDraftSessionModel } from "@/features/planner/planner-draft-session-model";
import {
  selectPlannerCalendarModel,
  type PlannerCalendarModel,
  type PlannerCalendarModelArgs,
} from "@/features/planner/planner-calendar-model";

type UsePlannerCalendarModelArgs = Omit<PlannerCalendarModelArgs, "memoizedState">;

export function usePlannerCalendarModel({
  context,
  draftPreview,
  draftPolicy,
  draftCommandState,
  month,
  selectedDay,
  viewMode,
  setupTimezone,
  duoScope,
  categoryFilter,
  endMonthFilter,
  searchQuery,
  partnerCompletionMarkersByDate,
  previewEntryOrderByDay,
  additionalProjectionDays,
}: UsePlannerCalendarModelArgs): PlannerCalendarModel {
  const currentScopeMonth = month ?? context?.scopeMonth ?? null;
  const draftSession = useMemo(
    () =>
      selectPlannerDraftSessionModel({
        context,
        draftPreview,
        draftPolicy,
        draftCommandState,
        currentScopeMonth,
      }),
    [context, currentScopeMonth, draftCommandState, draftPolicy, draftPreview]
  );
  const activeGoalIndexes = useMemo(
    () => buildActiveGoalIndexes(context?.activePlan?.goals),
    [context?.activePlan?.goals]
  );
  const calendarStoreProjection = useMemo(
    () =>
      selectPlannerCalendarStoreProjection({
        context,
        effectivePreview: draftSession.effectivePreview,
        draftCommandState,
        activeGoalsByPlanGoalId: activeGoalIndexes.byPlanGoalId,
        activeGoalsByOriginalGoalId: activeGoalIndexes.byOriginalGoalId,
      }),
    [
      activeGoalIndexes.byOriginalGoalId,
      activeGoalIndexes.byPlanGoalId,
      context,
      draftCommandState,
      draftSession.effectivePreview,
    ]
  );

  return useMemo(
    () =>
      selectPlannerCalendarModel({
        context,
        draftPreview,
        draftPolicy,
        draftCommandState,
        month,
        selectedDay,
        viewMode,
        setupTimezone,
        duoScope,
        categoryFilter,
        endMonthFilter,
        searchQuery,
        partnerCompletionMarkersByDate,
        previewEntryOrderByDay,
        additionalProjectionDays,
        memoizedState: {
          draftSession,
          activeGoalIndexes,
          calendarStoreProjection,
        },
      }),
    [
      additionalProjectionDays,
      activeGoalIndexes,
      calendarStoreProjection,
      categoryFilter,
      context,
      draftCommandState,
      draftSession,
      draftPolicy,
      draftPreview,
      duoScope,
      endMonthFilter,
      searchQuery,
      month,
      partnerCompletionMarkersByDate,
      previewEntryOrderByDay,
      selectedDay,
      setupTimezone,
      viewMode,
    ]
  );
}
