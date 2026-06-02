import {
  endOfISOWeek,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { isPastDate, toLocalDateString } from "@/lib/dates/day";
import type { Completion, Goal } from "@/lib/goals/types";

function completionSet(completions: Completion[]) {
  return new Set(completions.map((entry) => entry.completed_on));
}

export function getPeriodKeyForGoal(goal: Goal, completedOn: string): string {
  const date = parseISO(completedOn);

  if (goal.frequency_type !== "recurring") {
    return format(date, "yyyy-MM-dd");
  }

  if (goal.recurrence_interval === "weekly") {
    return format(startOfISOWeek(date), "RRRR-'W'II");
  }

  if (goal.recurrence_interval === "monthly") {
    return format(date, "yyyy-MM");
  }

  return format(date, "yyyy-MM-dd");
}

export function isGoalDoneForCurrentPeriod(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): boolean {
  const today = toLocalDateString(referenceDate);
  const completedDates = completionSet(completions);

  if (
    goal.frequency_type === "fixed_milestones" ||
    goal.recurrence_interval === "daily"
  ) {
    return completedDates.has(today);
  }

  if (goal.recurrence_interval === "weekly") {
    const start = startOfISOWeek(referenceDate);
    const end = endOfISOWeek(referenceDate);
    return completions.some((entry) =>
      isWithinInterval(parseISO(entry.completed_on), { start, end })
    );
  }

  if (goal.recurrence_interval === "monthly") {
    const start = startOfMonth(referenceDate);
    const end = endOfMonth(referenceDate);
    return completions.some((entry) =>
      isWithinInterval(parseISO(entry.completed_on), { start, end })
    );
  }

  return completedDates.has(today);
}

export function hasCompletionToday(
  completions: Completion[],
  referenceDate = new Date()
): boolean {
  const today = toLocalDateString(referenceDate);
  return completions.some((entry) => entry.completed_on === today);
}

export function isGoalCompleted(
  goal: Goal,
  completionCount: number,
  referenceDate = new Date()
): boolean {
  if (goal.target_count !== null && completionCount >= goal.target_count) {
    return true;
  }

  if (goal.end_date && isPastDate(goal.end_date, referenceDate)) {
    return true;
  }

  return false;
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
    return `${completionCount}/${goal.target_count ?? 0} fixed`;
  }

  const intervalLabel = getRecurringIntervalLabel(goal);

  if (goal.target_count !== null) {
    return `${intervalLabel} recurring · ${completionCount}/${goal.target_count} completions`;
  }

  return `${intervalLabel} recurring · ${completionCount} completions`;
}
