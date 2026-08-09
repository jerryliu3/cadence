import { isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { toLocalDateString } from "@/lib/dates/day";
import { getAnchoredPeriod } from "@/lib/goals/periods";
import type { CompletionDateFact, Goal } from "@/lib/goals/types";
import { isTargetedRecurringGoal } from "@/lib/planner/requirements";

function completionSet(completions: CompletionDateFact[]) {
  return new Set(completions.map((entry) => entry.completed_on));
}

export function getGoalPeriodStartDate(goal: Goal, referenceDate = new Date()): Date {
  const normalizedDate = startOfDay(referenceDate);

  if (goal.frequency_type !== "recurring") {
    return normalizedDate;
  }

  const period = getAnchoredPeriod(
    goal.start_date,
    goal.recurrence_interval ?? "daily",
    toLocalDateString(normalizedDate)
  );
  return startOfDay(parseISO(period.start));
}

export function getGoalPeriodEndDate(goal: Goal, referenceDate = new Date()): Date {
  const periodStart = getGoalPeriodStartDate(goal, referenceDate);

  if (goal.frequency_type !== "recurring") {
    return periodStart;
  }

  const period = getAnchoredPeriod(
    goal.start_date,
    goal.recurrence_interval ?? "daily",
    toLocalDateString(referenceDate)
  );
  return startOfDay(parseISO(period.end));
}

export function getCompletionsForCurrentPeriod(
  goal: Goal,
  completions: CompletionDateFact[],
  referenceDate = new Date()
): CompletionDateFact[] {
  const periodStart = getGoalPeriodStartDate(goal, referenceDate);
  const periodEnd = getGoalPeriodEndDate(goal, referenceDate);

  return completions.filter((entry) => {
    const completionDate = startOfDay(parseISO(entry.completed_on));
    return !isBefore(completionDate, periodStart) && !isAfter(completionDate, periodEnd);
  });
}

export function isGoalDoneForCurrentPeriod(
  goal: Goal,
  completions: CompletionDateFact[],
  referenceDate = new Date()
): boolean {
  const today = toLocalDateString(referenceDate);
  const completedDates = completionSet(completions);

  if (goal.frequency_type === "fixed_milestones") {
    return completedDates.has(today);
  }

  if (isTargetedRecurringGoal(goal)) {
    return completedDates.has(today);
  }

  return getCompletionsForCurrentPeriod(goal, completions, referenceDate).length > 0;
}

export function hasCompletionToday(
  completions: CompletionDateFact[],
  referenceDate = new Date()
): boolean {
  const today = toLocalDateString(referenceDate);
  return completions.some((entry) => entry.completed_on === today);
}

export function isGoalManuallyArchived(goal: Goal): boolean {
  return goal.archived_at !== null;
}

function getRecurringIntervalLabel(goal: Goal): string {
  if (goal.recurrence_interval === "weekly") {
    return "Weekly";
  }

  if (goal.recurrence_interval === "monthly") {
    return "Monthly";
  }

  return "Daily";
}

export function getFrequencySummary(goal: Goal, completionCount: number): string {
  if (goal.frequency_type === "fixed_milestones") {
    return `${completionCount}/${goal.target_count ?? 0} milestones completed`;
  }

  if (isTargetedRecurringGoal(goal)) {
    return `${completionCount}/${goal.target_count} total completions by deadline`;
  }

  const intervalLabel = getRecurringIntervalLabel(goal);
  return `${intervalLabel} recurring · ${completionCount} completions`;
}
