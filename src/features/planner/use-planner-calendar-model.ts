"use client";

import { useCallback, useMemo } from "react";
import { buildPlannerLinkedTargetIndexes } from "@/features/planner/calendar-linked-targets";
import {
  getEntryCompactTitle,
  getEntryDisplayTitle,
} from "@/features/planner/calendar-format";
import type {
  DayPreviewState,
  PlannerCalendarViewMode,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
} from "@/features/planner/calendar-surface.types";
import type { DraftCommandState } from "@/features/planner/draft-command-reducer";
import {
  selectPlannerDraftSessionModel,
  type PlannerDraftSessionModel,
} from "@/features/planner/planner-draft-session-model";
import { selectPlannerEligibilityNotices } from "@/features/planner/planner-eligibility-notices";
import { buildMoveSourceOptions } from "@/features/planner/planner-move-source-options";
import { selectPlannerSaveAvailability } from "@/features/planner/planner-save-availability";
import {
  useCalendarDayAccessors,
  type CalendarDayAccessorsResult,
} from "@/features/planner/use-calendar-day-accessors";
import { selectCalendarViewWindowModel } from "@/features/planner/calendar-view-window";

export type PlannerWarningSeverity = "none" | "informational" | "actionable";

interface UsePlannerCalendarModelArgs {
  context: PlannerContextPayload | null;
  draftPreview: NonNullable<PlannerContextPayload["preview"]> | null;
  draftPolicy: import("@/lib/planner/policy").PlannerPolicy | null;
  draftCommandState: DraftCommandState;
  month: string | null;
  viewMode: PlannerCalendarViewMode;
  duoScope: "me" | "partner" | "both";
  categoryFilter: string;
  endMonthFilter: string | null;
  partnerCompletionMarkersByDate?: Map<string, PlannerCompletionFactMarker[]>;
  selectedEventEntryKey: string | null;
  moveDialogDay: string | null;
  moveDialogSourceEntryKey: string;
  localSelectedDay: string | null;
  expandedPreviewDay: string | null;
  dayPreview: DayPreviewState | null;
  previewEntryOrderByDay: Record<string, string[]>;
  visibleDays: string[];
  focusedDay: string;
  focusedWeekDays: string[];
  focusedThreeDayDays: string[];
  calendarToday: string;
  todayMonth: string;
  weekStartsOn: number;
}

export interface PlannerCalendarModel {
  currentScopeMonth: string | null;
  draftSession: PlannerDraftSessionModel;
  dayAccessors: CalendarDayAccessorsResult;
  saveAvailability: ReturnType<typeof selectPlannerSaveAvailability>;
  viewWindow: ReturnType<typeof selectCalendarViewWindowModel>;
  warningSuggestedNextSteps: string[];
  hasPlannerWarnings: boolean;
  plannerWarningSeverity: PlannerWarningSeverity;
  plannerWarningBannerCopy: string;
  selectedEventLinkedTargets: PlannerContextPayload["links"];
  getEntryDisplayTitleWithTime: (
    entry: CalendarDayAccessorsResult["focusedDayEntries"][number]
  ) => string;
  getEntryCompactTitleWithTime: (
    entry: CalendarDayAccessorsResult["focusedDayEntries"][number]
  ) => string;
  moveDialogSourceOptions: ReturnType<typeof buildMoveSourceOptions>;
  effectiveMoveDialogSourceEntryKey: string;
  eligibilityNotices: ReturnType<typeof selectPlannerEligibilityNotices>;
}

export function usePlannerCalendarModel({
  context,
  draftPreview,
  draftPolicy,
  draftCommandState,
  month,
  viewMode,
  duoScope,
  categoryFilter,
  endMonthFilter,
  partnerCompletionMarkersByDate,
  selectedEventEntryKey,
  moveDialogDay,
  moveDialogSourceEntryKey,
  localSelectedDay,
  expandedPreviewDay,
  dayPreview,
  previewEntryOrderByDay,
  visibleDays,
  focusedDay,
  focusedWeekDays,
  focusedThreeDayDays,
  calendarToday,
  todayMonth,
  weekStartsOn,
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

  const dayAccessors = useCalendarDayAccessors({
    context,
    effectivePreview: draftSession.effectivePreview,
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
    dayPreviewDay: dayPreview?.day ?? null,
    expandedPreviewDay,
    moveDialogDay,
    localSelectedDay,
    selectedEventEntryKey,
    previewEntryOrderByDay,
    draftWindowUnitByEntryKey: draftSession.draftWindowUnitByEntryKey,
  });

  const eligibilityNotices = useMemo(
    () =>
      selectPlannerEligibilityNotices({
        context,
        effectivePreview: draftSession.effectivePreview,
        month,
      }),
    [context, draftSession.effectivePreview, month]
  );

  const saveAvailability = useMemo(
    () =>
      selectPlannerSaveAvailability({
        context,
        effectivePreview: draftSession.effectivePreview,
        draftSaveWindow: draftSession.draftSaveWindow,
        draftWindowTooWide: draftSession.draftWindowTooWide,
        hasDraftSession: draftSession.hasDraftSession,
        plannerReadOnly: dayAccessors.plannerReadOnly,
      }),
    [
      context,
      dayAccessors.plannerReadOnly,
      draftSession.draftSaveWindow,
      draftSession.draftWindowTooWide,
      draftSession.effectivePreview,
      draftSession.hasDraftSession,
    ]
  );

  const viewWindow = useMemo(
    () =>
      selectCalendarViewWindowModel({
        month,
        viewMode,
        focusedDay,
        focusedWeekDays,
        focusedThreeDayDays,
        calendarToday,
        todayMonth,
        weekStartsOn,
      }),
    [
      calendarToday,
      focusedDay,
      focusedThreeDayDays,
      focusedWeekDays,
      month,
      todayMonth,
      viewMode,
      weekStartsOn,
    ]
  );

  const warningSuggestedNextSteps = useMemo(() => {
    const suggestions: string[] = [];
    if (dayAccessors.invalidLockGoalCount > 0) {
      suggestions.push("Unlock conflicting locked sessions and regenerate the calendar.");
    }
    if (dayAccessors.capacityWarningGoalCount > 0) {
      suggestions.push(
        "Open planner settings to adjust targets, deadlines, or rest-day constraints."
      );
    }
    return suggestions;
  }, [dayAccessors.capacityWarningGoalCount, dayAccessors.invalidLockGoalCount]);

  const hasPlannerWarnings =
    dayAccessors.unplaceableGoalSummaries.length > 0 ||
    eligibilityNotices.hardIneligible.length > 0 ||
    eligibilityNotices.linkedTargetCount > 0;
  const plannerWarningSeverity: PlannerWarningSeverity = !hasPlannerWarnings
    ? "none"
    : dayAccessors.unplaceableGoalSummaries.length > 0 ||
        eligibilityNotices.hardIneligible.length > 0
      ? "actionable"
      : "informational";
  const plannerWarningBannerCopy =
    plannerWarningSeverity === "actionable"
      ? "Some goals need updates before the calendar can be fully scheduled."
      : `${eligibilityNotices.linkedTargetCount} linked target goal${
          eligibilityNotices.linkedTargetCount === 1 ? "" : "s"
        } ${
          eligibilityNotices.linkedTargetCount === 1 ? "is" : "are"
        } hidden in this month while source goals remain active.`;

  const linkedTargetIndexes = useMemo(
    () => buildPlannerLinkedTargetIndexes(context?.links ?? []),
    [context?.links]
  );
  const selectedEventLinkedTargets = useMemo(
    () =>
      dayAccessors.selectedEventEntry
        ? linkedTargetIndexes.linksBySourceGoalId.get(
            dayAccessors.selectedEventEntry.originalGoalId
          ) ?? []
        : [],
    [dayAccessors.selectedEventEntry, linkedTargetIndexes.linksBySourceGoalId]
  );

  const getEntryDisplayTitleWithTime = useCallback(
    (entry: CalendarDayAccessorsResult["focusedDayEntries"][number]) => {
      const baseTitle = getEntryDisplayTitle(entry);
      return entry.effectiveScheduledLocalTime
        ? `${entry.effectiveScheduledLocalTime} ${baseTitle}`
        : baseTitle;
    },
    []
  );
  const getEntryCompactTitleWithTime = useCallback(
    (entry: CalendarDayAccessorsResult["focusedDayEntries"][number]) => {
      const baseTitle = getEntryCompactTitle(entry);
      return entry.effectiveScheduledLocalTime
        ? `${entry.effectiveScheduledLocalTime} ${baseTitle}`
        : baseTitle;
    },
    []
  );

  const scopeMonth = context?.scopeMonth ?? null;
  const moveDialogSourceOptions = useMemo(
    () =>
      buildMoveSourceOptions({
        targetDay: moveDialogDay,
        scopeMonth,
        moveDialogEntriesForTargetDay: dayAccessors.moveDialogEntriesForTargetDay,
        entriesByDate: dayAccessors.entriesByDate,
        draftWindowUnitByEntryKey: draftSession.draftWindowUnitByEntryKey,
        canMutateEntryOnDay: dayAccessors.canMutateEntryOnDay,
        getEntryDisplayTitleWithTime,
      }),
    [
      dayAccessors.canMutateEntryOnDay,
      dayAccessors.entriesByDate,
      dayAccessors.moveDialogEntriesForTargetDay,
      draftSession.draftWindowUnitByEntryKey,
      getEntryDisplayTitleWithTime,
      moveDialogDay,
      scopeMonth,
    ]
  );

  const effectiveMoveDialogSourceEntryKey = useMemo(() => {
    if (
      moveDialogSourceEntryKey &&
      moveDialogSourceOptions.some(
        (option) => option.entryKey === moveDialogSourceEntryKey
      )
    ) {
      return moveDialogSourceEntryKey;
    }
    return moveDialogSourceOptions[0]?.entryKey ?? "";
  }, [moveDialogSourceEntryKey, moveDialogSourceOptions]);

  return {
    currentScopeMonth,
    draftSession,
    dayAccessors,
    saveAvailability,
    viewWindow,
    warningSuggestedNextSteps,
    hasPlannerWarnings,
    plannerWarningSeverity,
    plannerWarningBannerCopy,
    selectedEventLinkedTargets,
    getEntryDisplayTitleWithTime,
    getEntryCompactTitleWithTime,
    moveDialogSourceOptions,
    effectiveMoveDialogSourceEntryKey,
    eligibilityNotices,
  };
}
