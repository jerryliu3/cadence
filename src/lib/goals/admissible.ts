import {
  compareDateStrings,
  getAnchoredPeriod,
} from "@/lib/goals/periods";
import type { Completion, Goal } from "@/lib/goals/types";
import { getGoalRequirement } from "@/lib/planner/requirements";

export interface GoalProgressContext {
  asOfDate: string;
}

function getCreditEndDate(goal: Goal, asOfDate: string) {
  if (
    goal.end_date &&
    compareDateStrings(goal.end_date, asOfDate) < 0
  ) {
    return goal.end_date;
  }
  return asOfDate;
}

export function isCompletionAdmissible(
  goal: Goal,
  completedOn: string,
  { asOfDate }: GoalProgressContext
) {
  if (compareDateStrings(completedOn, goal.start_date) < 0) {
    return false;
  }
  if (compareDateStrings(completedOn, asOfDate) > 0) {
    return false;
  }
  if (
    goal.end_date &&
    compareDateStrings(completedOn, goal.end_date) > 0
  ) {
    return false;
  }
  return true;
}

export function getAdmissibleCompletions(
  goal: Goal,
  completions: Completion[],
  context: GoalProgressContext
) {
  return completions
    .filter((completion) =>
      isCompletionAdmissible(goal, completion.completed_on, context)
    )
    .sort((left, right) =>
      left.completed_on.localeCompare(right.completed_on)
    );
}

export function getExpectedCadencePeriodCount(
  goal: Goal,
  { asOfDate }: GoalProgressContext
) {
  if (
    goal.frequency_type !== "recurring" ||
    getGoalRequirement(goal).kind !== "cadence" ||
    compareDateStrings(asOfDate, goal.start_date) < 0
  ) {
    return 0;
  }

  const interval = goal.recurrence_interval ?? "daily";
  const creditEnd = getCreditEndDate(goal, asOfDate);
  return getAnchoredPeriod(goal.start_date, interval, creditEnd).index + 1;
}

export function getCreditedUnitCount(
  goal: Goal,
  completions: Completion[],
  context: GoalProgressContext
) {
  const admissible = getAdmissibleCompletions(goal, completions, context);
  const requirement = getGoalRequirement(goal);

  if (requirement.kind !== "cadence") {
    return Math.min(admissible.length, requirement.targetCount);
  }

  return new Set(
    admissible.map(
      (completion) =>
        getAnchoredPeriod(
          goal.start_date,
          requirement.interval,
          completion.completed_on
        ).periodKey
    )
  ).size;
}
