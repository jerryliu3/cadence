import { format, isValid, parse } from "date-fns";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import {
  completionDisabledReasonCopy,
  getDayStatus,
  getMonthInTimezone,
  monthToLabel,
  resolveNonPublishablePreviewMessage,
  restWeekdayOptions,
} from "@/features/planner/calendar-format";
import type {
  CompletionControlDisabledReason,
  PlannerCalendarViewMode,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerCalendarDayProjection } from "@/features/planner/calendar-store-selectors";

const MAX_MONTH_HEADING_SAMPLE = "September 2026";
const MAX_WEEK_HEADING_SAMPLE = "Sep 30 - Sep 30, 2026";
const MAX_DAY_HEADING_SAMPLE = "Wed Aug 30";

const READ_ONLY_MONTH_HINT =
  "This session belongs to another month snapshot. Open that month to edit it.";

const SCOPE_ONLY_ELIGIBILITY_REASONS = new Set([
  "end_outside_scope",
  "starts_after_scope",
]);

const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  not_owner: "Only goals you own can be planned here.",
  group_goal: "Group goals are excluded from personal planner scheduling.",
  deleted: "Deleted goals are excluded from planning.",
  archived: "Archived goals are excluded from planning.",
  linked: "Linked goals are managed by their source relationship.",
  missing_end_date:
    "This goal needs a deadline before it can be planned in Calendar.",
  invalid_date_range: "The goal dates are invalid (start is after end).",
  horizon_too_long:
    "This goal deadline exceeds the 24-month planning horizon limit.",
};

function getEligibilityReasonLabel(reason: string) {
  return ELIGIBILITY_REASON_LABELS[reason] ?? "This goal is currently ineligible.";
}

export interface PlannerHorizonCounter {
  thisMonth: number;
  total: number;
  remaining: number;
}

export interface PlannerEligibilityNotices {
  hardIneligible: Array<{
    goalId: string;
    goalTitle: string;
    reasonCopy: string;
  }>;
  scopeOnlyCount: number;
}

export function selectPlannerHorizonCounter(
  preview: PlannerContextPayload["preview"]
): PlannerHorizonCounter | null {
  const summary = preview?.horizonSummary ?? [];
  if (summary.length === 0) {
    return null;
  }
  const total = summary.reduce((count, goal) => count + goal.totalCount, 0);
  if (total <= 0) {
    return null;
  }
  const thisMonth = summary.reduce(
    (count, goal) => count + goal.scopeMonthPlannedCount,
    0
  );
  const remaining = summary.reduce((count, goal) => count + goal.remainingCount, 0);
  return { thisMonth, total, remaining };
}

export function selectPlannerEligibilityNotices({
  preview,
  goalTitles,
}: {
  preview: PlannerContextPayload["preview"];
  goalTitles: Record<string, string> | null | undefined;
}): PlannerEligibilityNotices {
  const eligibilityEntries = preview?.eligibility ?? [];
  if (eligibilityEntries.length === 0) {
    return { hardIneligible: [], scopeOnlyCount: 0 };
  }

  const hardIneligible: PlannerEligibilityNotices["hardIneligible"] = [];
  let scopeOnlyCount = 0;

  for (const eligibilityEntry of eligibilityEntries) {
    if (eligibilityEntry.eligible) {
      continue;
    }
    if (SCOPE_ONLY_ELIGIBILITY_REASONS.has(eligibilityEntry.reason)) {
      scopeOnlyCount += 1;
      continue;
    }
    hardIneligible.push({
      goalId: eligibilityEntry.goalId,
      goalTitle: goalTitles?.[eligibilityEntry.goalId] ?? eligibilityEntry.goalId,
      reasonCopy: getEligibilityReasonLabel(eligibilityEntry.reason),
    });
  }

  hardIneligible.sort((left, right) =>
    left.goalTitle.localeCompare(right.goalTitle)
  );
  return { hardIneligible, scopeOnlyCount };
}

export function selectPlannerCalendarHeaderModel({
  preview,
  goalTitles,
}: {
  preview: PlannerContextPayload["preview"];
  goalTitles: Record<string, string> | null | undefined;
}) {
  return {
    horizonCounter: selectPlannerHorizonCounter(preview),
    eligibilityNotices: selectPlannerEligibilityNotices({
      preview,
      goalTitles,
    }),
  };
}

export function selectPlannerCalendarViewModel({
  month,
  viewMode,
  focusedDay,
  focusedWeekDays,
  calendarToday,
  weekStartsOn,
  timezone,
}: {
  month: string | null;
  viewMode: PlannerCalendarViewMode;
  focusedDay: string;
  focusedWeekDays: string[];
  calendarToday: string;
  weekStartsOn: number;
  timezone: string;
}) {
  const monthLabel = month ? monthToLabel(month) : "Calendar";
  const todayMonth = getMonthInTimezone(timezone);
  const parsedFocusedDay = parse(focusedDay, "yyyy-MM-dd", new Date());
  const safeFocusedDay = isValid(parsedFocusedDay)
    ? parsedFocusedDay
    : parse(calendarToday, "yyyy-MM-dd", new Date());
  const focusedWeekStartDate = parse(
    focusedWeekDays[0] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const focusedWeekEndDate = parse(
    focusedWeekDays[6] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const viewHeading =
    viewMode === "month"
      ? monthLabel
      : viewMode === "week"
        ? `${format(focusedWeekStartDate, "MMM d")} - ${format(
            focusedWeekEndDate,
            "MMM d, yyyy"
          )}`
        : format(safeFocusedDay, "EEE MMM d");
  const viewHeadingControlWidth = `min(100%, calc(${Math.max(
    monthLabel.length,
    MAX_MONTH_HEADING_SAMPLE.length,
    MAX_WEEK_HEADING_SAMPLE.length,
    MAX_DAY_HEADING_SAMPLE.length
  )}ch + ${viewMode === "month" ? "11rem" : "8rem"}))`;
  const viewDescription =
    viewMode === "month"
      ? `${restWeekdayOptions.find((option) => option.value === weekStartsOn)?.label ?? "Mon"}-first month view. Drag session pills to stage preview edits.`
      : viewMode === "week"
        ? "Expanded 7-day planner view with drag-and-drop editing."
        : "Day agenda view with completion and detail controls.";
  const previousWindowAriaLabel =
    viewMode === "month"
      ? "Previous month"
      : viewMode === "week"
        ? "Previous week"
        : "Previous day";
  const nextWindowAriaLabel =
    viewMode === "month"
      ? "Next month"
      : viewMode === "week"
        ? "Next week"
        : "Next day";
  const canResetViewWindow =
    viewMode === "month" ? month !== todayMonth : focusedDay !== calendarToday;

  return {
    monthLabel,
    todayMonth,
    safeFocusedDay,
    viewHeading,
    viewHeadingControlWidth,
    viewDescription,
    previousWindowAriaLabel,
    nextWindowAriaLabel,
    canResetViewWindow,
  };
}

export type PlannerCalendarViewModel = ReturnType<
  typeof selectPlannerCalendarViewModel
>;

/**
 * Save blocking is per scope month, not per calendar view. A draft can dirty
 * several months at once, and each one is validated against its own preview --
 * the current month's from `effectivePreview`, siblings from the draft preview
 * cache or the visible-month context. The first blocking scope wins so the
 * message can name the month the user has to fix.
 */
export function selectPlannerCalendarSaveStateModel({
  context,
  effectivePreview,
  hasDraftSession,
  saveLoading,
  dirtyScopeMonths,
  draftPreviewByScope,
  visibleMonthContexts,
}: {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"];
  hasDraftSession: boolean;
  saveLoading: boolean;
  dirtyScopeMonths: string[];
  draftPreviewByScope: Record<string, NonNullable<PlannerContextPayload["preview"]>>;
  visibleMonthContexts: Record<
    string,
    { preview?: PlannerContextPayload["preview"] }
  >;
}) {
  const scopeMonthsForSaveAction =
    hasDraftSession && dirtyScopeMonths.length > 0
      ? dirtyScopeMonths
      : context?.scopeMonth
        ? [context.scopeMonth]
        : [];

  const blockedSaveScope = (() => {
    if (!context?.capabilities.calendarEnabled) {
      return null;
    }
    for (const scopeMonth of scopeMonthsForSaveAction) {
      const previewForScope =
        scopeMonth === context.scopeMonth
          ? effectivePreview
          : draftPreviewByScope[scopeMonth] ??
            visibleMonthContexts[scopeMonth]?.preview;
      if (!previewForScope) {
        continue;
      }
      if (
        scopeMonth < context.asOfDate.slice(0, 7) ||
        !previewForScope.solver.publishable
      ) {
        return {
          scopeMonth,
          message: resolveNonPublishablePreviewMessage(
            context,
            previewForScope,
            scopeMonth
          ),
        };
      }
    }
    return null;
  })();

  const hasLockedPlanItems = Boolean(
    context?.activePlan?.items.some((item) => item.locked)
  );

  return {
    scopeMonthsForSaveAction,
    draftSaveBlocked: blockedSaveScope !== null,
    draftSaveBlockedMessage: blockedSaveScope
      ? `${blockedSaveScope.scopeMonth}: ${blockedSaveScope.message}`
      : null,
    hasLockedPlanItems,
    canResetPlan: Boolean(
      context?.capabilities.calendarEnabled &&
        !hasDraftSession &&
        hasLockedPlanItems
    ),
    canShowSaveAction: Boolean(
      context?.capabilities.calendarEnabled && effectivePreview
    ),
    saveButtonLabel: saveLoading ? "Saving..." : "Save plan",
    readOnlyMonthHint: READ_ONLY_MONTH_HINT,
  };
}

export type PlannerCalendarSaveStateModel = ReturnType<
  typeof selectPlannerCalendarSaveStateModel
>;


export interface PlannerCalendarDayCellRenderModel {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPastInMonth: boolean;
  ariaLabel: string;
  entriesForDay: PlannerDayDetailEntry[];
  completionFactMarkersForDay: PlannerCompletionFactMarker[];
}

export interface PlannerEntryCompletionToggleViewModel {
  currentlyCredited: boolean;
  disabledReasonCopy: string | null;
}

export function selectPlannerCalendarDayCellRenderModel({
  cell,
  dayProjection,
  calendarToday,
}: {
  cell: {
    date: string;
    inMonth: boolean;
  };
  dayProjection: PlannerCalendarDayProjection;
  calendarToday: string;
}): PlannerCalendarDayCellRenderModel {
  const entriesForDay = dayProjection.orderedEntries;
  const completionFactMarkersForDay = dayProjection.completionFactMarkers;
  const status =
    entriesForDay.length > 0
      ? getDayStatus(entriesForDay, "No items")
      : completionFactMarkersForDay.length > 0
        ? "Completed elsewhere"
        : "No items";
  const isToday = cell.date === calendarToday;
  const isPastInMonth = cell.inMonth && cell.date < calendarToday;
  const ariaLabel = `${format(
    parse(cell.date, "yyyy-MM-dd", new Date()),
    "EEEE, MMMM d, yyyy"
  )}. ${entriesForDay.length} planned item${
    entriesForDay.length === 1 ? "" : "s"
  }. ${completionFactMarkersForDay.length} completion fact${
    completionFactMarkersForDay.length === 1 ? "" : "s"
  }. ${status}.`;

  return {
    day: cell.date,
    inMonth: cell.inMonth,
    isToday,
    isPastInMonth,
    ariaLabel,
    entriesForDay,
    completionFactMarkersForDay,
  };
}

export function selectPlannerEntryCompletionToggleViewModel({
  entry,
  day,
  canMutateEntryOnDay,
  isEntryCredited,
  readOnlyMonthHint,
  getDateFactDispatchForEntry,
  completionControlDisabledReasonForEntry,
}: {
  entry: PlannerDayDetailEntry;
  day: string;
  canMutateEntryOnDay: (
    entry: PlannerDayDetailEntry,
    day: string | null
  ) => boolean;
  isEntryCredited: (entry: PlannerDayDetailEntry) => boolean;
  readOnlyMonthHint: string;
  getDateFactDispatchForEntry: (
    entry: PlannerDayDetailEntry,
    selectedDate?: string | null
  ) => PlannerEntryDateFactDispatch | null;
  completionControlDisabledReasonForEntry: (
    entry: PlannerDayDetailEntry,
    dispatch: PlannerEntryDateFactDispatch | null
  ) => CompletionControlDisabledReason | null;
}): PlannerEntryCompletionToggleViewModel {
  if (!canMutateEntryOnDay(entry, day)) {
    return {
      currentlyCredited: isEntryCredited(entry),
      disabledReasonCopy: readOnlyMonthHint,
    };
  }

  const completionDispatch = getDateFactDispatchForEntry(entry, day);
  const completionDisabledReason = completionControlDisabledReasonForEntry(
    entry,
    completionDispatch
  );
  return {
    currentlyCredited: Boolean(completionDispatch?.currentlyCredited),
    disabledReasonCopy: completionDisabledReason
      ? completionDisabledReasonCopy(completionDisabledReason)
      : null,
  };
}
