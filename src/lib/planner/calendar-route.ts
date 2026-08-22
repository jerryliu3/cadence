import {
  isMonthScopedCalendarViewMode,
  isValidCalendarViewMode,
  isValidDate,
  isValidMonth,
  normalizeCalendarState,
  type CalendarState,
  type PlannerCalendarViewMode,
} from "@cadence/shared/planner/calendar-state";

type SearchParamsLike = {
  get(name: string): string | null;
  has?(name: string): boolean;
  toString(): string;
};

function setIfChanged(
  params: URLSearchParams,
  key: string,
  value: string
): boolean {
  if (params.get(key) === value) {
    return false;
  }
  params.set(key, value);
  return true;
}

function deleteIfPresent(params: URLSearchParams, key: string): boolean {
  if (!params.has(key)) {
    return false;
  }
  params.delete(key);
  return true;
}

function dropInvalidCalendarParams(
  searchParams: SearchParamsLike,
  nextParams: URLSearchParams
) {
  const rawMonth = searchParams.get("month");
  const rawDay = searchParams.get("day");
  const rawView = searchParams.get("view");
  let changed = false;
  if (rawDay && !isValidDate(rawDay)) {
    changed = deleteIfPresent(nextParams, "day") || changed;
  }
  if (rawMonth && !isValidMonth(rawMonth)) {
    changed = deleteIfPresent(nextParams, "month") || changed;
  }
  if (rawView && !isValidCalendarViewMode(rawView)) {
    changed = deleteIfPresent(nextParams, "view") || changed;
  }
  return changed;
}

function writeCalendarParams(
  nextParams: URLSearchParams,
  state: CalendarState
) {
  let changed = setIfChanged(nextParams, "view", state.viewMode);
  if (isMonthScopedCalendarViewMode(state.viewMode)) {
    changed = deleteIfPresent(nextParams, "day") || changed;
    if (state.month) {
      changed = setIfChanged(nextParams, "month", state.month) || changed;
    }
    return changed;
  }
  if (state.day) {
    changed = setIfChanged(nextParams, "day", state.day) || changed;
  }
  if (state.month) {
    changed = setIfChanged(nextParams, "month", state.month) || changed;
  }
  return changed;
}

export function normalizeChecklistShellRoute({
  searchParams,
  defaultCalendarViewMode,
}: {
  searchParams: SearchParamsLike;
  defaultCalendarViewMode: PlannerCalendarViewMode;
}) {
  const rawTab = searchParams.get("tab");
  const state = normalizeCalendarState({
    tab: rawTab,
    month: searchParams.get("month"),
    day: searchParams.get("day"),
    viewMode: searchParams.get("view"),
    defaultCalendarViewMode,
    surface: "checklist-shell",
  });
  const nextParams = new URLSearchParams(searchParams.toString());
  const hasExplicitTab =
    rawTab === "today" || rawTab === "not-today" || rawTab === "calendar";
  let changed = dropInvalidCalendarParams(searchParams, nextParams);

  if (rawTab && !hasExplicitTab) {
    changed = setIfChanged(nextParams, "tab", "today") || changed;
  }

  if (state.tab === "calendar") {
    changed = setIfChanged(nextParams, "tab", "calendar") || changed;
    changed = writeCalendarParams(nextParams, state) || changed;
  }

  return {
    ...state,
    changed,
    nextParams,
  };
}

export function normalizeCalendarRoute({
  searchParams,
  defaultCalendarViewMode,
}: {
  searchParams: SearchParamsLike;
  defaultCalendarViewMode: PlannerCalendarViewMode;
}) {
  const state = normalizeCalendarState({
    month: searchParams.get("month"),
    day: searchParams.get("day"),
    viewMode: searchParams.get("view"),
    defaultCalendarViewMode,
    surface: "calendar",
  });
  const nextParams = new URLSearchParams(searchParams.toString());
  let changed = dropInvalidCalendarParams(searchParams, nextParams);
  changed = writeCalendarParams(nextParams, state) || changed;

  return {
    month: state.month,
    day: state.day,
    viewMode: state.viewMode,
    changed,
    nextParams,
  };
}
