import { format, parse } from "date-fns";
import { getDateInTimezone } from "@/lib/dates/timezone";
import type {
  CompletionControlDisabledReason,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";

export const monthWeekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const restWeekdayOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

export function getMonthInTimezone(timezone: string) {
  return getDateInTimezone(new Date(), timezone).slice(0, 7);
}

export function monthToLabel(month: string) {
  return format(parseMonth(month), "MMMM yyyy");
}

export function isDerivedCounterLabel(value: string | null) {
  if (!value) {
    return false;
  }
  return /^total:\d+$/i.test(value.trim());
}

export function getEntryDisplayTitle(
  entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label" | "unitKey">
) {
  if (entry.goalTitle) {
    return entry.goalTitle;
  }
  if (entry.label && !isDerivedCounterLabel(entry.label)) {
    return entry.label;
  }
  return entry.unitKey;
}

export function getEntrySubtitle(
  entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label">
) {
  if (!entry.label || isDerivedCounterLabel(entry.label)) {
    return null;
  }
  if (entry.goalTitle && entry.label === entry.goalTitle) {
    return null;
  }
  return entry.label;
}

export function getDayStatus(
  itemsForDay: Array<{ classification: string; creditState: string }>,
  fallback: string
) {
  if (!itemsForDay || itemsForDay.length === 0) {
    return fallback;
  }
  if (itemsForDay.some((item) => item.classification.startsWith("historical"))) {
    return "Historical";
  }
  if (itemsForDay.some((item) => item.creditState !== "uncredited")) {
    return "Completed";
  }
  return "Planned";
}

export function isEntryCredited(entry: PlannerDayDetailEntry) {
  return (
    entry.creditState !== "uncredited" ||
    Boolean(entry.activeItem?.credited_completion_id)
  );
}

export function isEntryImmovableForDraft(entry: PlannerDayDetailEntry) {
  return (
    isEntryCredited(entry) ||
    entry.classification === "satisfied_elsewhere" ||
    entry.classification === "historical_miss" ||
    entry.classification === "historical_shortfall"
  );
}

export function completionDisabledReasonCopy(reason: CompletionControlDisabledReason) {
  if (reason === "future_creation") {
    return "You can only mark planner sessions done for today or past dates.";
  }
  if (reason === "satisfied_elsewhere") {
    return "This session is already satisfied by a completion elsewhere.";
  }
  if (reason === "out_of_scope_route") {
    return "This session is outside the active publish scope for completion updates.";
  }
  return "This session cannot be updated from the current planner snapshot.";
}

export function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function createClientUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

