import { format, parse } from "date-fns";

export type PlannerShellTab = "today" | "not-today" | "calendar";
export type SurfaceKey = "checklist" | "calendar";
export type PlannerCalendarViewMode = "month" | "week" | "day";

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
  value: string | null
): value is PlannerCalendarViewMode {
  return value === "month" || value === "week" || value === "day";
}

export function getTodayDateParam() {
  return format(new Date(), "yyyy-MM-dd");
}

export function getSurfaceKey(tab: PlannerShellTab): SurfaceKey {
  return tab === "calendar" ? "calendar" : "checklist";
}

export function normalizeChecklistShellRoute({
  searchParams,
  defaultCalendarViewMode,
}: {
  searchParams: URLSearchParams;
  defaultCalendarViewMode: PlannerCalendarViewMode;
}) {
  const rawTab = searchParams.get("tab");
  const rawMonth = searchParams.get("month");
  const rawDay = searchParams.get("day");
  const rawView = searchParams.get("view");
  const dayValid = isValidDate(rawDay);
  const monthValid = isValidMonth(rawMonth);
  const nextParams = new URLSearchParams(searchParams.toString());
  const rawViewModeValid = isValidCalendarViewMode(rawView);
  const hasExplicitTab =
    rawTab === "today" || rawTab === "not-today" || rawTab === "calendar";
  let viewMode: PlannerCalendarViewMode = rawViewModeValid
    ? rawView
    : defaultCalendarViewMode;
  let tab: PlannerShellTab = hasExplicitTab ? rawTab : "today";
  let changed = false;
  if (rawTab && !hasExplicitTab) {
    nextParams.set("tab", "today");
    changed = true;
  }

  if (rawDay && !dayValid) {
    nextParams.delete("day");
    changed = true;
  }
  if (rawMonth && !monthValid) {
    nextParams.delete("month");
    changed = true;
  }
  if (rawView && !rawViewModeValid) {
    nextParams.delete("view");
    changed = true;
  }

  if (dayValid) {
    if (!hasExplicitTab || tab === "calendar") {
      const dayMonth = rawDay.slice(0, 7);
      if (nextParams.get("month") !== dayMonth) {
        nextParams.set("month", dayMonth);
        changed = true;
      }
      if (tab !== "calendar") {
        tab = "calendar";
        nextParams.set("tab", "calendar");
        changed = true;
      }
      if (!rawViewModeValid && viewMode !== "day") {
        viewMode = "day";
        nextParams.set("view", "day");
        changed = true;
      }
    }
  }

  if (tab === "calendar") {
    if (nextParams.get("view") !== viewMode) {
      nextParams.set("view", viewMode);
      changed = true;
    }
    if (viewMode === "day") {
      const dayParam = nextParams.get("day");
      const normalizedDay = isValidDate(dayParam) ? dayParam : getTodayDateParam();
      if (nextParams.get("day") !== normalizedDay) {
        nextParams.set("day", normalizedDay);
        changed = true;
      }
      const normalizedMonth = normalizedDay.slice(0, 7);
      if (nextParams.get("month") !== normalizedMonth) {
        nextParams.set("month", normalizedMonth);
        changed = true;
      }
    } else if (viewMode === "week") {
      const dayParam = nextParams.get("day");
      const monthParam = nextParams.get("month");
      const fallbackDay = isValidMonth(monthParam)
        ? `${monthParam}-01`
        : getTodayDateParam();
      const normalizedDay = isValidDate(dayParam) ? dayParam : fallbackDay;
      if (nextParams.get("day") !== normalizedDay) {
        nextParams.set("day", normalizedDay);
        changed = true;
      }
      const normalizedMonth = normalizedDay.slice(0, 7);
      if (nextParams.get("month") !== normalizedMonth) {
        nextParams.set("month", normalizedMonth);
        changed = true;
      }
    } else if (viewMode === "month" && nextParams.has("day")) {
      nextParams.delete("day");
      changed = true;
    }
  }
  const normalizedMonthParam = nextParams.get("month");
  const normalizedDayParam = nextParams.get("day");
  const normalizedViewParam = nextParams.get("view");
  const normalizedViewMode = isValidCalendarViewMode(normalizedViewParam)
    ? normalizedViewParam
    : viewMode;

  return {
    tab,
    month: isValidMonth(normalizedMonthParam) ? normalizedMonthParam : null,
    day: isValidDate(normalizedDayParam) ? normalizedDayParam : null,
    viewMode: normalizedViewMode,
    changed,
    nextParams,
  };
}
