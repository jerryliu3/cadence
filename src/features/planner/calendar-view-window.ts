import { addMonths, format, isValid, parse } from "date-fns";
import { isMonthScopedCalendarViewMode } from "@cadence/shared/planner/calendar-state";
import { monthToLabel, restWeekdayOptions } from "@/features/planner/calendar-format";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";

const MAX_MONTH_HEADING_SAMPLE = "September 2026";
const MAX_THREE_MONTH_HEADING_SAMPLE = "Aug - Oct 2026";
const MAX_WEEK_HEADING_SAMPLE = "Sep 30 - Sep 30, 2026";
const MAX_THREE_DAY_HEADING_SAMPLE = "Sep 30 - Oct 2, 2026";
const MAX_DAY_HEADING_SAMPLE = "Wed Aug 30";

interface CalendarViewWindowModelArgs {
  month: string | null;
  viewMode: PlannerCalendarViewMode;
  focusedDay: string;
  focusedWeekDays: string[];
  focusedThreeDayDays: string[];
  calendarToday: string;
  todayMonth: string;
  weekStartsOn: number;
}

export interface CalendarViewWindowModel {
  resolvedFocusedDay: string;
  viewHeading: string;
  fixedViewHeadingWidthCh: number;
  viewDescription: string;
  previousWindowAriaLabel: string;
  nextWindowAriaLabel: string;
  canResetViewWindow: boolean;
  stepDays: number;
}

function buildThreeMonthHeading({
  month,
  fallbackLabel,
}: {
  month: string | null;
  fallbackLabel: string;
}) {
  if (!month) {
    return fallbackLabel;
  }
  const monthStart = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  if (!isValid(monthStart)) {
    return fallbackLabel;
  }
  const previousMonthLabel = format(addMonths(monthStart, -1), "MMM");
  const nextMonthLabel = format(addMonths(monthStart, 1), "MMM yyyy");
  return `${previousMonthLabel} - ${nextMonthLabel}`;
}

function resolveViewHeading({
  viewMode,
  monthLabel,
  threeMonthHeading,
  focusedWeekStartDate,
  focusedWeekEndDate,
  focusedThreeDayStartDate,
  focusedThreeDayEndDate,
  safeFocusedDay,
}: {
  viewMode: PlannerCalendarViewMode;
  monthLabel: string;
  threeMonthHeading: string;
  focusedWeekStartDate: Date;
  focusedWeekEndDate: Date;
  focusedThreeDayStartDate: Date;
  focusedThreeDayEndDate: Date;
  safeFocusedDay: Date;
}) {
  switch (viewMode) {
    case "month":
      return monthLabel;
    case "three_month":
      return threeMonthHeading;
    case "week":
      return `${format(focusedWeekStartDate, "MMM d")} - ${format(
        focusedWeekEndDate,
        "MMM d, yyyy"
      )}`;
    case "three_day":
      return `${format(focusedThreeDayStartDate, "MMM d")} - ${format(
        focusedThreeDayEndDate,
        "MMM d, yyyy"
      )}`;
    case "day":
      return format(safeFocusedDay, "EEE MMM d, yyyy");
  }
}

function resolveViewDescription({
  viewMode,
  weekStartsOn,
}: {
  viewMode: PlannerCalendarViewMode;
  weekStartsOn: number;
}) {
  switch (viewMode) {
    case "month":
      return `${restWeekdayOptions.find((option) => option.value === weekStartsOn)?.label ?? "Mon"}-first month view. Drag session pills to stage preview edits.`;
    case "three_month":
      return "Three-month planner view. Drag session pills across visible days to stage preview edits.";
    case "week":
      return "Expanded 7-day planner view with drag-and-drop editing.";
    case "three_day":
      return "Three-day focus with a scrollable week strip for context.";
    case "day":
      return "Day agenda with a scrollable week strip and detail controls.";
  }
}

function resolveWindowAriaLabel({
  viewMode,
  direction,
}: {
  viewMode: PlannerCalendarViewMode;
  direction: "previous" | "next";
}) {
  if (isMonthScopedCalendarViewMode(viewMode)) {
    if (viewMode === "month") {
      return direction === "previous" ? "Previous month" : "Next month";
    }
    return direction === "previous"
      ? "Previous month window"
      : "Next month window";
  }
  switch (viewMode) {
    case "week":
      return direction === "previous" ? "Previous week" : "Next week";
    case "three_day":
      return direction === "previous" ? "Previous 3 days" : "Next 3 days";
    case "day":
      return direction === "previous" ? "Previous day" : "Next day";
  }
}

function resolveStepDays(viewMode: PlannerCalendarViewMode) {
  switch (viewMode) {
    case "week":
      return 7;
    case "three_day":
      return 3;
    default:
      return 1;
  }
}

export function selectCalendarViewWindowModel({
  month,
  viewMode,
  focusedDay,
  focusedWeekDays,
  focusedThreeDayDays,
  calendarToday,
  todayMonth,
  weekStartsOn,
}: CalendarViewWindowModelArgs): CalendarViewWindowModel {
  const monthLabel = month ? monthToLabel(month) : "Calendar";
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
  const focusedThreeDayStartDate = parse(
    focusedThreeDayDays[0] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const focusedThreeDayEndDate = parse(
    focusedThreeDayDays[2] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const threeMonthHeading = buildThreeMonthHeading({
    month,
    fallbackLabel: monthLabel,
  });
  const viewHeading = resolveViewHeading({
    viewMode,
    monthLabel,
    threeMonthHeading,
    focusedWeekStartDate,
    focusedWeekEndDate,
    focusedThreeDayStartDate,
    focusedThreeDayEndDate,
    safeFocusedDay,
  });
  const resolvedFocusedDay = format(safeFocusedDay, "yyyy-MM-dd");

  const fixedViewHeadingWidthCh = Math.max(
    monthLabel.length,
    MAX_MONTH_HEADING_SAMPLE.length,
    MAX_THREE_MONTH_HEADING_SAMPLE.length,
    MAX_WEEK_HEADING_SAMPLE.length,
    MAX_THREE_DAY_HEADING_SAMPLE.length,
    MAX_DAY_HEADING_SAMPLE.length
  );
  const viewDescription = resolveViewDescription({ viewMode, weekStartsOn });
  const previousWindowAriaLabel = resolveWindowAriaLabel({
    viewMode,
    direction: "previous",
  });
  const nextWindowAriaLabel = resolveWindowAriaLabel({
    viewMode,
    direction: "next",
  });
  const canResetViewWindow = isMonthScopedCalendarViewMode(viewMode)
    ? month !== todayMonth
    : focusedDay !== calendarToday;

  return {
    resolvedFocusedDay,
    viewHeading,
    fixedViewHeadingWidthCh,
    viewDescription,
    previousWindowAriaLabel,
    nextWindowAriaLabel,
    canResetViewWindow,
    stepDays: resolveStepDays(viewMode),
  };
}
