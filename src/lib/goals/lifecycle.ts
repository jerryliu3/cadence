import {
  getCreditedUnitCount,
  getExpectedCadencePeriodCount,
  type GoalProgressContext,
} from "@/lib/goals/admissible";
import { compareDateStrings } from "@/lib/goals/periods";
import type { Completion, Goal } from "@/lib/goals/types";
import { getGoalRequirement } from "@/lib/planner/requirements";

export type GoalLifecycle = "upcoming" | "active" | "ended" | "archived";
export type GoalOutcome =
  | "in_progress"
  | "achieved"
  | "ended_with_shortfall";

export interface GoalLifecycleOutcome {
  lifecycle: GoalLifecycle;
  outcome: GoalOutcome;
  placementTerminal: boolean;
}

export function getGoalLifecycle(
  goal: Goal,
  { asOfDate }: GoalProgressContext
): GoalLifecycle {
  if (goal.archived_at !== null) {
    return "archived";
  }
  if (compareDateStrings(asOfDate, goal.start_date) < 0) {
    return "upcoming";
  }
  if (
    goal.end_date !== null &&
    compareDateStrings(asOfDate, goal.end_date) > 0
  ) {
    return "ended";
  }
  return "active";
}

export function getGoalOutcome(
  goal: Goal,
  completions: Completion[],
  context: GoalProgressContext
): GoalOutcome {
  const archivedOn = goal.archived_at?.slice(0, 10) ?? null;
  const outcomeContext = {
    asOfDate:
      archivedOn &&
      compareDateStrings(archivedOn, context.asOfDate) < 0
        ? archivedOn
        : context.asOfDate,
  };
  const requirement = getGoalRequirement(goal);
  const creditedUnits = getCreditedUnitCount(
    goal,
    completions,
    outcomeContext
  );
  const deadlinePassed =
    goal.end_date !== null &&
    compareDateStrings(outcomeContext.asOfDate, goal.end_date) > 0;

  if (requirement.kind === "cadence") {
    if (!deadlinePassed) {
      return "in_progress";
    }
    const expectedUnits = getExpectedCadencePeriodCount(goal, {
      asOfDate: goal.end_date ?? context.asOfDate,
    });
    return creditedUnits >= expectedUnits
      ? "achieved"
      : "ended_with_shortfall";
  }

  if (creditedUnits >= requirement.targetCount) {
    return "achieved";
  }
  return deadlinePassed ? "ended_with_shortfall" : "in_progress";
}

export function getGoalLifecycleOutcome(
  goal: Goal,
  completions: Completion[],
  context: GoalProgressContext
): GoalLifecycleOutcome {
  const lifecycle = getGoalLifecycle(goal, context);
  const outcome = getGoalOutcome(goal, completions, context);

  return {
    lifecycle,
    outcome,
    placementTerminal:
      lifecycle === "ended" ||
      lifecycle === "archived" ||
      outcome === "achieved",
  };
}
