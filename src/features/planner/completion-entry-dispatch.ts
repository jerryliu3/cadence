import type {
  CompletionControlDisabledReason,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import {
  resolveCompletionDispatch,
  type CompletionDispatchDecision,
} from "@/lib/planner/completion-dispatch";

export interface DateFactDispatchForEntry {
  currentlyCredited: boolean;
  desiredFactState: "present" | "absent";
  decision: CompletionDispatchDecision;
}

export interface CompletionControlState {
  currentlyCredited: boolean;
  dispatch: DateFactDispatchForEntry | null;
  disabledReason: CompletionControlDisabledReason | null;
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

export function getCompletionControlDisabledReason({
  entry,
  dispatch,
  canMutatePlanItems,
  canMutateEntryOnDay,
}: {
  entry: PlannerDayDetailEntry;
  dispatch: DateFactDispatchForEntry | null;
  canMutatePlanItems: boolean;
  canMutateEntryOnDay: boolean;
}): CompletionControlDisabledReason | null {
  if (entry.draftGhost) {
    return "unsupported";
  }
  if (!dispatch) {
    return "unsupported";
  }
  if (!dispatch.decision.allowed) {
    if (dispatch.decision.reason === "future_creation") {
      return "future_creation";
    }
    if (dispatch.decision.reason === "satisfied_elsewhere") {
      return "satisfied_elsewhere";
    }
    return "unsupported";
  }
  if (dispatch.decision.route === "canonical_exact_date") {
    return null;
  }
  if (!canMutateEntryOnDay) {
    return "out_of_scope_route";
  }
  if (dispatch.decision.route === "item_date") {
    if (!canMutatePlanItems || !entry.activeItem) {
      return "out_of_scope_route";
    }
    return null;
  }
  if (dispatch.decision.route === "plan_goal_date") {
    if (!canMutatePlanItems || !entry.activeGoal) {
      return "out_of_scope_route";
    }
    return null;
  }
  return "out_of_scope_route";
}

export function getCompletionControlState({
  entry,
  selectedDate,
  asOfDate,
  canMutatePlanItems,
  canMutateEntryOnDay,
}: {
  entry: PlannerDayDetailEntry;
  selectedDate: string | null;
  asOfDate: string | null;
  canMutatePlanItems: boolean;
  canMutateEntryOnDay: boolean;
}): CompletionControlState {
  const dispatch = getDateFactDispatchForEntry({
    entry,
    selectedDate,
    asOfDate,
  });
  const disabledReason = getCompletionControlDisabledReason({
    entry,
    dispatch,
    canMutatePlanItems,
    canMutateEntryOnDay,
  });
  return {
    currentlyCredited: Boolean(dispatch?.currentlyCredited),
    dispatch,
    disabledReason,
  };
}
