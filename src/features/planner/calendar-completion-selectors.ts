import type {
  CompletionControlDisabledReason,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import {
  resolveCompletionDispatch,
  type CompletionDispatchDecision,
} from "@/lib/planner/completion-dispatch";

export interface PlannerEntryDateFactDispatch {
  currentlyCredited: boolean;
  desiredFactState: "present" | "absent";
  decision: CompletionDispatchDecision;
}

function deriveRequirementKind(
  entry: PlannerDayDetailEntry
): "milestone_sequence" | "cadence" | "deadline_total" {
  if (entry.activeItem?.requirement_kind) {
    return entry.activeItem.requirement_kind;
  }
  if (entry.unitKey.startsWith("milestone:")) {
    return "milestone_sequence";
  }
  if (entry.unitKey.startsWith("cadence:")) {
    return "cadence";
  }
  return "deadline_total";
}

export function resolveDateFactDispatchForEntry({
  entry,
  context,
  selectedDate,
}: {
  entry: PlannerDayDetailEntry;
  context: PlannerContextPayload | null;
  selectedDate: string | null;
}): PlannerEntryDateFactDispatch | null {
  if (!context || !selectedDate) {
    return null;
  }

  const requirementKind = deriveRequirementKind(entry);
  // Keep exact-date completion behavior when the session is not yet in a plan.
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
    selectedDate < context.asOfDate
      ? "past"
      : selectedDate > context.asOfDate
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

export function resolveCompletionControlDisabledReasonForEntry({
  entry,
  dispatch,
  canMutatePlanItems,
  calendarEnabled,
}: {
  entry: PlannerDayDetailEntry;
  dispatch: PlannerEntryDateFactDispatch | null;
  canMutatePlanItems: boolean;
  calendarEnabled: boolean;
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
    return calendarEnabled ? null : "out_of_scope_route";
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
