import { toLocalDateString } from "@/lib/dates/day";
import {
  getAdmissibleCompletions,
  getCreditedUnitCount,
  getExpectedCadencePeriodCount,
} from "@/lib/goals/admissible";
import {
  getGoalLifecycleOutcome,
  type GoalLifecycle,
  type GoalOutcome,
} from "@/lib/goals/lifecycle";
import {
  compareDateStrings,
  getAnchoredPeriod,
  type WeeklyAnchorContext,
} from "@/lib/goals/periods";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  getGoalRequirement,
  isTargetedRecurringGoal,
} from "@/lib/planner/requirements";

export interface GoalProgressSnapshot {
  goalId: string;
  admissibleCompletionCount: number;
  creditedUnitCount: number;
  expectedUnitCount: number;
  percent: number;
  lifecycle: GoalLifecycle;
  outcome: GoalOutcome;
  placementTerminal: boolean;
  currentStreak: number;
  longestStreak: number;
  milestoneDates: string[];
}

interface GoalWeeklyAnchorOptions {
  weeklyAnchor?: WeeklyAnchorContext | null;
}

export function getGoalCompletionPercentage(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date(),
  options: GoalWeeklyAnchorOptions = {}
): number {
  const context = {
    asOfDate: toLocalDateString(referenceDate),
    weeklyAnchor: options.weeklyAnchor ?? null,
  };
  const requirement = getGoalRequirement(goal);
  const completedUnits = getCreditedUnitCount(goal, completions, context);
  const expected =
    requirement.kind === "cadence"
      ? getExpectedCadencePeriodCount(goal, context)
      : requirement.targetCount;

  if (expected === 0) {
    return 0;
  }
  return Math.min(100, (completedUnits / expected) * 100);
}

export function getOverallCompletionPercentage(
  goals: Goal[],
  completionsByGoal: Map<string, Completion[]>,
  referenceDate = new Date(),
  options: GoalWeeklyAnchorOptions = {}
): number {
  if (goals.length === 0) {
    return 0;
  }

  const total = goals.reduce((accumulator, goal) => {
    const completions = completionsByGoal.get(goal.id) ?? [];
    return (
      accumulator +
      getGoalCompletionPercentage(goal, completions, referenceDate, options)
    );
  }, 0);

  return total / goals.length;
}

export function getRecurringStreaks(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date(),
  options: GoalWeeklyAnchorOptions = {}
): { current: number; longest: number } {
  return getRecurringStreaksAtDate(
    goal,
    completions,
    toLocalDateString(referenceDate),
    options
  );
}

export function getRecurringStreaksAtDate(
  goal: Goal,
  completions: Completion[],
  asOfDate: string,
  options: GoalWeeklyAnchorOptions = {}
): { current: number; longest: number } {
  if (
    goal.frequency_type !== "recurring" ||
    isTargetedRecurringGoal(goal)
  ) {
    return { current: 0, longest: 0 };
  }

  const admissible = getAdmissibleCompletions(goal, completions, {
    asOfDate,
    weeklyAnchor: options.weeklyAnchor ?? null,
  });
  const interval = goal.recurrence_interval ?? "daily";
  const uniqueIndices = Array.from(
    new Set(
      admissible.map(
        (entry) =>
          getAnchoredPeriod(
            goal.start_date,
            interval,
            entry.completed_on,
            options.weeklyAnchor ?? null
          ).index
      )
    )
  ).sort((left, right) => left - right);

  if (uniqueIndices.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let running = 1;

  for (let index = 1; index < uniqueIndices.length; index += 1) {
    const contiguous = uniqueIndices[index] === uniqueIndices[index - 1] + 1;
    running = contiguous ? running + 1 : 1;
    longest = Math.max(longest, running);
  }

  if (compareDateStrings(asOfDate, goal.start_date) < 0) {
    return { current: 0, longest };
  }

  const boundedReference =
    goal.end_date && compareDateStrings(asOfDate, goal.end_date) > 0
      ? goal.end_date
      : asOfDate;
  const currentPeriodIndex = getAnchoredPeriod(
    goal.start_date,
    interval,
    boundedReference,
    options.weeklyAnchor ?? null
  ).index;
  const lastCompleted = uniqueIndices[uniqueIndices.length - 1];
  let current = 0;

  if (lastCompleted === currentPeriodIndex) {
    current = 1;

    for (
      let index = uniqueIndices.length - 2;
      index >= 0;
      index -= 1
    ) {
      if (uniqueIndices[index] + 1 !== uniqueIndices[index + 1]) {
        break;
      }
      current += 1;
    }
  }

  return { current, longest };
}

export function getGoalProgressSnapshot(
  goal: Goal,
  completions: Completion[],
  asOfDate: string,
  options: GoalWeeklyAnchorOptions = {}
): GoalProgressSnapshot {
  const context = { asOfDate, weeklyAnchor: options.weeklyAnchor ?? null };
  const admissible = getAdmissibleCompletions(goal, completions, context);
  const requirement = getGoalRequirement(goal);
  const creditedUnitCount = getCreditedUnitCount(goal, completions, context);
  const expectedUnitCount =
    requirement.kind === "cadence"
      ? getExpectedCadencePeriodCount(goal, context)
      : requirement.targetCount;
  const lifecycleOutcome = getGoalLifecycleOutcome(
    goal,
    completions,
    context
  );
  const streaks = getRecurringStreaksAtDate(goal, completions, asOfDate, options);

  return {
    goalId: goal.id,
    admissibleCompletionCount: admissible.length,
    creditedUnitCount,
    expectedUnitCount,
    percent:
      expectedUnitCount === 0
        ? 0
        : Math.min(100, (creditedUnitCount / expectedUnitCount) * 100),
    lifecycle: lifecycleOutcome.lifecycle,
    outcome: lifecycleOutcome.outcome,
    placementTerminal: lifecycleOutcome.placementTerminal,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    milestoneDates:
      requirement.kind === "milestone_sequence"
        ? admissible
            .slice(0, requirement.targetCount)
            .map((completion) => completion.completed_on)
        : [],
  };
}
