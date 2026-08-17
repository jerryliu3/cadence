import { format, parse } from "date-fns";
import type { PlannerDraftVisualKind } from "@/lib/planner/diff";
import { getDateInTimezone } from "@/lib/dates/timezone";
import { weekStartOptions } from "@/lib/dates/weekday-options";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import type {
  CompletionControlDisabledReason,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";

const weekdayLabelsSunFirst = weekStartOptions.map((option) => option.shortLabel);
export { normalizeWeekStartsOn };

export function buildWeekdayLabels(weekStartsOn: number) {
  const normalizedWeekStartsOn = normalizeWeekStartsOn(weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => {
    const weekday = (normalizedWeekStartsOn + index) % 7;
    return weekdayLabelsSunFirst[weekday] ?? "Mon";
  });
}

export const restWeekdayOptions: Array<{ value: number; label: string }> = weekStartOptions.map(
  (option) => ({
    value: option.value,
    label: option.shortLabel,
  })
);

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

export function getEntryCompactTitle(
  entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label" | "unitKey">
) {
  if (entry.label && !isDerivedCounterLabel(entry.label)) {
    if (!entry.goalTitle || entry.label !== entry.goalTitle) {
      return entry.label;
    }
  }
  return getEntryDisplayTitle(entry);
}

export function getEntryDisplayTitleWithTime(
  entry: Pick<
    PlannerDayDetailEntry,
    "goalTitle" | "label" | "unitKey" | "effectiveScheduledLocalTime"
  >
) {
  const baseTitle = getEntryDisplayTitle(entry);
  return entry.effectiveScheduledLocalTime
    ? `${entry.effectiveScheduledLocalTime} ${baseTitle}`
    : baseTitle;
}

export function getEntryCompactTitleWithTime(
  entry: Pick<
    PlannerDayDetailEntry,
    "goalTitle" | "label" | "unitKey" | "effectiveScheduledLocalTime"
  >
) {
  const baseTitle = getEntryCompactTitle(entry);
  return entry.effectiveScheduledLocalTime
    ? `${entry.effectiveScheduledLocalTime} ${baseTitle}`
    : baseTitle;
}

export function getEntrySubtitle(
  entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label">
) {
  if (entry.label && !isDerivedCounterLabel(entry.label)) {
    if (!entry.goalTitle || entry.label !== entry.goalTitle) {
      return `Next: ${entry.label}`;
    }
  }
  return null;
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
    entry.draftGhost ||
    entry.classification === "satisfied_elsewhere"
  );
}

export function getEntryDraftDiffSummary(entry: {
  draftDiffKind: PlannerDraftVisualKind | null;
  draftDiffFromDate: string | null;
  draftDiffToDate: string | null;
}) {
  if (!entry.draftDiffKind) {
    return null;
  }
  if (entry.draftDiffKind === "new") {
    return "New draft placement.";
  }
  if (entry.draftDiffKind === "moved_to") {
    return entry.draftDiffFromDate
      ? `Moved from ${entry.draftDiffFromDate}.`
      : "Moved to this date in draft.";
  }
  return entry.draftDiffToDate
    ? `Moved to ${entry.draftDiffToDate}.`
    : "Removed from this date in draft.";
}

export function getEntryDraftPillClasses(input: {
  draftDiffKind: PlannerDraftVisualKind | null;
  credited: boolean;
}) {
  if (input.draftDiffKind === "moved_from") {
    return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950";
  }
  if (input.draftDiffKind === "moved_to") {
    return "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-300 dark:bg-sky-100 dark:text-sky-950";
  }
  if (input.draftDiffKind === "new") {
    return "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-300 dark:bg-violet-100 dark:text-violet-950";
  }
  if (input.credited) {
    return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950";
  }
  return "border-border bg-background";
}

export function entryDisplayRank(entry: {
  draftDiffKind: PlannerDraftVisualKind | null;
  creditState: string;
}) {
  if (entry.draftDiffKind === "moved_from") {
    return 0;
  }
  if (entry.draftDiffKind === "new") {
    return 1;
  }
  if (entry.draftDiffKind === "moved_to") {
    return 2;
  }
  if (entry.creditState !== "uncredited") {
    return 4;
  }
  return 3;
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

export { moveItemInArray } from "@cadence/shared/planner/reorder-preview-entries";
export { createClientUuid } from "@cadence/shared/ids";

