import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import {
  resolveCompletionDispatch,
  type CompletionDispatchDecision,
} from "@/lib/planner/completion-dispatch";

export interface DateFactDispatchForEntry {
  currentlyCredited: boolean;
  desiredFactState: "present" | "absent";
  decision: CompletionDispatchDecision;
}

export function getDateFactDispatchForEntry({
  entry,
  selectedDate,
  asOfDate,
}: {
  entry: PlannerDayDetailEntry;
  selectedDate: string | null;
  asOfDate: string | null;
}): DateFactDispatchForEntry | null {
  if (!asOfDate || !selectedDate) {
    return null;
  }

  const requirementKind =
    entry.activeItem?.requirement_kind ??
    (entry.unitKey.startsWith("milestone:")
      ? "milestone_sequence"
      : entry.unitKey.startsWith("cadence:")
        ? "cadence"
        : "deadline_total");
  const targetedRecurring =
    requirementKind === "deadline_total" || !entry.activeGoal;
  const currentlyCredited =
    entry.creditState !== "uncredited" ||
    Boolean(entry.activeItem?.credited_completion_id);
  const desiredFactState = currentlyCredited ? "absent" : "present";
  const matchingItemState =
    entry.classification === "satisfied_elsewhere"
      ? "satisfied_elsewhere"
      : entry.classification.startsWith("historical")
        ? "historical"
        : entry.activeItem
          ? "actionable"
          : "none";
  const selectedDateState =
    selectedDate < asOfDate
      ? "past"
      : selectedDate > asOfDate
        ? "future"
        : "today";

  const decision = resolveCompletionDispatch({
    requirementKind,
    targetedRecurring,
    activePlanMembership: Boolean(entry.activeGoal),
    matchingItemState,
    selectedDateState,
    existingExactFact: currentlyCredited,
    desiredFactState,
  });

  return {
    currentlyCredited,
    desiredFactState,
    decision,
  };
}
