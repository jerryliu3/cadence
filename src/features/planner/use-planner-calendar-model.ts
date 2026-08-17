"use client";

import { useMemo } from "react";
import {
  selectPlannerCalendarModel,
  type PlannerCalendarModel,
  type PlannerCalendarModelArgs,
} from "@/features/planner/planner-calendar-model";

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
  partnerCompletionMarkersByDate,
  previewEntryOrderByDay,
  additionalProjectionDays,
}: PlannerCalendarModelArgs): PlannerCalendarModel {
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
        partnerCompletionMarkersByDate,
        previewEntryOrderByDay,
        additionalProjectionDays,
      }),
    [
      additionalProjectionDays,
      categoryFilter,
      context,
      draftCommandState,
      draftPolicy,
      draftPreview,
      duoScope,
      endMonthFilter,
      month,
      partnerCompletionMarkersByDate,
      previewEntryOrderByDay,
      selectedDay,
      setupTimezone,
      viewMode,
    ]
  );
}
