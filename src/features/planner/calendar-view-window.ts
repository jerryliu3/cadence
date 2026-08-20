import { addMonths, format, isValid, parse } from "date-fns";
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
  const threeMonthHeading = (() => {
    if (!month) {
      return monthLabel;
    }
    const monthStart = parse(`${month}-01`, "yyyy-MM-dd", new Date());
    if (!isValid(monthStart)) {
      return monthLabel;
    }
    const previousMonthLabel = format(addMonths(monthStart, -1), "MMM");
    const nextMonthLabel = format(addMonths(monthStart, 1), "MMM yyyy");
    return `${previousMonthLabel} - ${nextMonthLabel}`;
  })();
  const viewHeading =
    viewMode === "month"
      ? monthLabel
      : viewMode === "three_month"
        ? threeMonthHeading
      : viewMode === "week"
        ? `${format(focusedWeekStartDate, "MMM d")} - ${format(
            focusedWeekEndDate,
            "MMM d, yyyy"
          )}`
        : viewMode === "three_day"
          ? `${format(focusedThreeDayStartDate, "MMM d")} - ${format(
              focusedThreeDayEndDate,
              "MMM d, yyyy"
            )}`
          : format(safeFocusedDay, "EEE MMM d, yyyy");
  const resolvedFocusedDay = format(safeFocusedDay, "yyyy-MM-dd");

  const fixedViewHeadingWidthCh = Math.max(
    monthLabel.length,
    MAX_MONTH_HEADING_SAMPLE.length,
    MAX_THREE_MONTH_HEADING_SAMPLE.length,
    MAX_WEEK_HEADING_SAMPLE.length,
    MAX_THREE_DAY_HEADING_SAMPLE.length,
    MAX_DAY_HEADING_SAMPLE.length
  );
  const viewDescription =
    viewMode === "month"
      ? `${restWeekdayOptions.find((option) => option.value === weekStartsOn)?.label ?? "Mon"}-first month view. Drag session pills to stage preview edits.`
      : viewMode === "three_month"
        ? "Three-month planner view. Drag session pills across visible days to stage preview edits."
      : viewMode === "week"
        ? "Expanded 7-day planner view with drag-and-drop editing."
        : viewMode === "three_day"
          ? "Three-day focus with a scrollable week strip for context."
          : "Day agenda with a scrollable week strip and detail controls.";
  const previousWindowAriaLabel =
    viewMode === "month"
      ? "Previous month"
      : viewMode === "three_month"
        ? "Previous month window"
      : viewMode === "week"
        ? "Previous week"
        : viewMode === "three_day"
          ? "Previous 3 days"
          : "Previous day";
  const nextWindowAriaLabel =
    viewMode === "month"
      ? "Next month"
      : viewMode === "three_month"
        ? "Next month window"
      : viewMode === "week"
        ? "Next week"
        : viewMode === "three_day"
          ? "Next 3 days"
          : "Next day";
  const canResetViewWindow =
    viewMode === "month" || viewMode === "three_month"
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
    stepDays: viewMode === "week" ? 7 : viewMode === "three_day" ? 3 : 1,
  };
}
