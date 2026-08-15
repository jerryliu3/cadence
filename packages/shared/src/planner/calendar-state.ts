import { format, parse } from "date-fns";

export type PlannerShellTab = "today" | "not-today" | "calendar";
export type SurfaceKey = "checklist" | "calendar";
export type PlannerCalendarViewMode = "month" | "week" | "three_day" | "day";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidMonth(value: string | null): value is string {
  return Boolean(value && monthPattern.test(value));
}

export function isValidDate(value: string | null): value is string {
  if (!value || !datePattern.test(value)) {
    return false;
  }
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return format(parsed, "yyyy-MM-dd") === value;
}

export function isValidCalendarViewMode(
  value: string | null | undefined
): value is PlannerCalendarViewMode {
  return (
    value === "month" ||
    value === "week" ||
    value === "three_day" ||
    value === "day"
  );
}

export function getTodayDateParam() {
  return format(new Date(), "yyyy-MM-dd");
}

export function getSurfaceKey(tab: PlannerShellTab): SurfaceKey {
  return tab === "calendar" ? "calendar" : "checklist";
}

export interface CalendarState {
  tab: PlannerShellTab;
  month: string | null;
  day: string | null;
  viewMode: PlannerCalendarViewMode;
}

function applyCalendarViewInvariants(
  month: string | null,
  day: string | null,
  viewMode: PlannerCalendarViewMode
): Pick<CalendarState, "month" | "day" | "viewMode"> {
  if (viewMode === "month") {
    return {
      month: isValidMonth(month) ? month : null,
      day: null,
      viewMode,
    };
  }

  const fallbackDay = isValidMonth(month) ? `${month}-01` : getTodayDateParam();
  const normalizedDay = isValidDate(day) ? day : fallbackDay;
  return {
    day: normalizedDay,
    month: normalizedDay.slice(0, 7),
    viewMode,
  };
}

export function normalizeCalendarState({
  tab = "today",
  month = null,
  day = null,
  viewMode,
  defaultCalendarViewMode,
  surface = "checklist-shell",
}: {
  tab?: string | null;
  month?: string | null;
  day?: string | null;
  viewMode?: string | null;
  defaultCalendarViewMode: PlannerCalendarViewMode;
  surface?: "checklist-shell" | "calendar";
}): CalendarState {
  const validMonth = isValidMonth(month) ? month : null;
  const validDay = isValidDate(day) ? day : null;
  const rawViewValid = isValidCalendarViewMode(viewMode);
  let resolvedView: PlannerCalendarViewMode = rawViewValid
    ? viewMode
    : defaultCalendarViewMode;

  if (surface === "calendar") {
    return {
      tab: "calendar",
      ...applyCalendarViewInvariants(validMonth, validDay, resolvedView),
    };
  }

  const hasExplicitTab =
    tab === "today" || tab === "not-today" || tab === "calendar";
  let resolvedTab: PlannerShellTab = hasExplicitTab ? tab : "today";

  if (validDay && (!hasExplicitTab || resolvedTab === "calendar")) {
    resolvedTab = "calendar";
    if (!rawViewValid && resolvedView !== "day") {
      resolvedView = "day";
    }
  }

  if (resolvedTab === "calendar") {
    return {
      tab: "calendar",
      ...applyCalendarViewInvariants(
        validDay ? validDay.slice(0, 7) : validMonth,
        validDay,
        resolvedView
      ),
    };
  }

  return {
    tab: resolvedTab,
    month: validMonth,
    day: validDay,
    viewMode: resolvedView,
  };
}
