import { buildPlannerLinkedTargetIndexes } from "@/features/planner/calendar-linked-targets";
import {
  getMonthInTimezone,
  normalizeWeekStartsOn,
} from "@/features/planner/calendar-format";
import type {
  PlannerCalendarViewMode,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
} from "@/features/planner/calendar-surface.types";
import {
  buildCalendarVisibleDateWindow,
  selectCalendarViewWindowProjection,
} from "@/features/planner/calendar-view-projection";
import type { CalendarViewWindowProjection } from "@/features/planner/calendar-view-projection";
import {
  selectCalendarViewWindowModel,
  type CalendarViewWindowModel,
} from "@/features/planner/calendar-view-window";
import type { DraftCommandState } from "@/features/planner/draft-command-reducer";
import {
  type PlannerDraftSessionModel,
} from "@/features/planner/planner-draft-session-model";
import {
  selectPlannerEligibilityNotices,
  type PlannerEligibilityNotices,
} from "@/features/planner/planner-eligibility-notices";
import {
  selectPlannerSaveAvailability,
  type PlannerSaveAvailability,
} from "@/features/planner/planner-save-availability";
import {
  selectPlannerWarningModel,
  type PlannerWarningModel,
} from "@/features/planner/planner-warning-model";
import {
  selectCalendarDayAccessorsModel,
  type CalendarDayAccessorsMemoizedState,
  type CalendarDayAccessorsResult,
} from "@/features/planner/planner-calendar-day-accessors-model";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { getDateInTimezone } from "@/lib/dates/timezone";

export interface PlannerCalendarModelArgs {
  context: PlannerContextPayload | null;
  draftPreview: NonNullable<PlannerContextPayload["preview"]> | null;
  draftPolicy: PlannerPolicy | null;
  draftCommandState: DraftCommandState;
  month: string | null;
  selectedDay: string | null;
  viewMode: PlannerCalendarViewMode;
  setupTimezone: string;
  duoScope: "me" | "partner" | "both";
  categoryFilter: string;
  endMonthFilter: string | null;
  searchQuery?: string;
  partnerCompletionMarkersByDate?: Map<string, PlannerCompletionFactMarker[]>;
  previewEntryOrderByDay: Record<string, string[]>;
  additionalProjectionDays: string[];
  memoizedState: PlannerCalendarMemoizedState;
}

export interface PlannerCalendarMemoizedState
  extends CalendarDayAccessorsMemoizedState {
  draftSession: PlannerDraftSessionModel;
}

export interface PlannerCalendarModel {
  currentScopeMonth: string | null;
  weekStartsOn: number;
  calendarToday: string;
  todayMonth: string;
  viewProjection: CalendarViewWindowProjection;
  viewWindow: CalendarViewWindowModel;
  draftSession: PlannerDraftSessionModel;
  dayAccessors: CalendarDayAccessorsResult;
  saveAvailability: PlannerSaveAvailability;
  warningModel: PlannerWarningModel;
  eligibilityNotices: PlannerEligibilityNotices;
  linkedTargetIndexes: ReturnType<typeof buildPlannerLinkedTargetIndexes>;
}

export function selectPlannerCalendarModel({
  context,
  draftCommandState,
  month,
  selectedDay,
  viewMode,
  setupTimezone,
  duoScope,
  categoryFilter,
  endMonthFilter,
  searchQuery = "",
  partnerCompletionMarkersByDate,
  previewEntryOrderByDay,
  additionalProjectionDays,
  memoizedState,
}: PlannerCalendarModelArgs): PlannerCalendarModel {
  const weekStartsOn = normalizeWeekStartsOn(
    context?.preferences?.defaultPolicy.weekStartsOn
  );
  const calendarToday =
    context?.asOfDate ??
    getDateInTimezone(new Date(), context?.timezone ?? setupTimezone);
  const todayMonth = context?.timezone
    ? getMonthInTimezone(context.timezone)
    : getMonthInTimezone(setupTimezone);
  const viewProjection = selectCalendarViewWindowProjection({
    month,
    selectedDay,
    calendarToday,
    weekStartsOn,
    viewMode,
  });
  const currentScopeMonth = month ?? context?.scopeMonth ?? null;
  const editableDateWindow = buildCalendarVisibleDateWindow(
    viewProjection.visibleDays
  );
  const draftSession = memoizedState.draftSession;
  const dayAccessors = selectCalendarDayAccessorsModel({
    context,
    effectivePreview: draftSession.effectivePreview,
    draftCommandState,
    currentScopeMonth,
    calendarToday,
    editableDateWindow,
    categoryFilter,
    endMonthFilter,
    searchQuery,
    duoScope,
    partnerCompletionMarkersByDate,
    visibleDays: viewProjection.visibleDays,
    additionalProjectionDays: [viewProjection.focusedDay, ...additionalProjectionDays],
    previewEntryOrderByDay,
    memoizedState,
  });
  const eligibilityNotices = selectPlannerEligibilityNotices({
    context,
    effectivePreview: draftSession.effectivePreview,
    month,
  });
  const saveAvailability = selectPlannerSaveAvailability({
    context,
    effectivePreview: draftSession.effectivePreview,
    draftSaveWindow: draftSession.draftSaveWindow,
    draftWindowTooWide: draftSession.draftWindowTooWide,
    hasDraftSession: draftSession.hasDraftSession,
    plannerReadOnly: dayAccessors.plannerReadOnly,
  });
  const warningModel = selectPlannerWarningModel({
    unplaceableGoalCount: dayAccessors.unplaceableGoalSummaries.length,
    invalidLockGoalCount: dayAccessors.invalidLockGoalCount,
    capacityWarningGoalCount: dayAccessors.capacityWarningGoalCount,
    eligibilityNotices,
  });
  const viewWindow = selectCalendarViewWindowModel({
    month,
    viewMode,
    focusedDay: viewProjection.focusedDay,
    focusedWeekDays: viewProjection.focusedWeekDays,
    focusedThreeDayDays: viewProjection.focusedThreeDayDays,
    calendarToday,
    todayMonth,
    weekStartsOn,
  });
  const linkedTargetIndexes = buildPlannerLinkedTargetIndexes(context?.links ?? []);

  return {
    currentScopeMonth,
    weekStartsOn,
    calendarToday,
    todayMonth,
    viewProjection,
    viewWindow,
    draftSession,
    dayAccessors,
    saveAvailability,
    warningModel,
    eligibilityNotices,
    linkedTargetIndexes,
  };
}
