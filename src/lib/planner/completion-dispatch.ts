export interface CompletionDispatchInput {
  requirementKind:
    | "milestone_sequence"
    | "cadence"
    | "deadline_total";
  targetedRecurring: boolean;
  activePlanMembership: boolean;
  matchingItemState:
    | "none"
    | "actionable"
    | "satisfied_elsewhere"
    | "historical";
  selectedDateState: "past" | "today" | "future";
  existingExactFact: boolean;
  desiredFactState: "present" | "absent";
}

export interface CompletionDispatchDecision {
  route:
    | "item_date"
    | "plan_goal_date"
    | "canonical_exact_date"
    | "legacy_period"
    | "disabled";
  exactDateOnly: boolean;
  allowed: boolean;
  reason:
    | "allowed"
    | "satisfied_elsewhere"
    | "future_creation"
    | "legacy_period_semantics";
}

export function resolveCompletionDispatch({
  targetedRecurring,
  activePlanMembership,
  matchingItemState,
  selectedDateState,
  existingExactFact,
  desiredFactState,
}: CompletionDispatchInput): CompletionDispatchDecision {
  if (matchingItemState === "satisfied_elsewhere") {
    return {
      route: "disabled",
      exactDateOnly: true,
      allowed: false,
      reason: "satisfied_elsewhere",
    };
  }

  let route: CompletionDispatchDecision["route"];
  if (
    activePlanMembership &&
    (matchingItemState === "actionable" ||
      matchingItemState === "historical")
  ) {
    route = "item_date";
  } else if (activePlanMembership) {
    route = "plan_goal_date";
  } else if (targetedRecurring) {
    route = "canonical_exact_date";
  } else {
    return {
      route: "legacy_period",
      exactDateOnly: false,
      allowed: true,
      reason: "legacy_period_semantics",
    };
  }

  const isFutureCreation =
    selectedDateState === "future" &&
    desiredFactState === "present" &&
    !existingExactFact;

  return {
    route,
    exactDateOnly: true,
    allowed: !isFutureCreation,
    reason: isFutureCreation ? "future_creation" : "allowed",
  };
}
