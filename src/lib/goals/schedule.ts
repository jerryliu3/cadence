import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import { isPastDate, toLocalDateString } from "@/lib/dates/day";
import type { Completion, Goal } from "@/lib/goals/types";

function completionSet(completions: Completion[]) {
  return new Set(completions.map((entry) => entry.completed_on));
}

function parseStartDate(goal: Goal): Date {
  return startOfDay(parseISO(goal.start_date));
}

export function getGoalPeriodStartDate(goal: Goal, referenceDate = new Date()): Date {
  const normalizedDate = startOfDay(referenceDate);
  const goalStart = parseStartDate(goal);

  if (goal.frequency_type !== "recurring" || goal.recurrence_interval === "daily") {
    return normalizedDate;
  }

  if (isBefore(normalizedDate, goalStart)) {
    return goalStart;
  }

  if (goal.recurrence_interval === "weekly") {
    const daysSinceStart = differenceInCalendarDays(normalizedDate, goalStart);
    const periodCount = Math.floor(daysSinceStart / 7);
    return addDays(goalStart, periodCount * 7);
  }

  let monthOffset =
    (normalizedDate.getFullYear() - goalStart.getFullYear()) * 12 +
    (normalizedDate.getMonth() - goalStart.getMonth());
  let periodStart = addMonths(goalStart, monthOffset);

  if (isAfter(periodStart, normalizedDate)) {
    monthOffset -= 1;
    periodStart = addMonths(goalStart, monthOffset);
  }

  return periodStart;
}

export function getGoalPeriodEndDate(goal: Goal, referenceDate = new Date()): Date {
  const periodStart = getGoalPeriodStartDate(goal, referenceDate);

  if (goal.frequency_type !== "recurring" || goal.recurrence_interval === "daily") {
    return periodStart;
  }

  if (goal.recurrence_interval === "weekly") {
    return addDays(periodStart, 6);
  }

  return subDays(addMonths(periodStart, 1), 1);
}

export function getPeriodKeyForGoal(goal: Goal, completedOn: string): string {
  const periodStart = getGoalPeriodStartDate(goal, parseISO(completedOn));
  return format(periodStart, "yyyy-MM-dd");
}

export function getCompletionsForCurrentPeriod(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): Completion[] {
  const periodStart = getGoalPeriodStartDate(goal, referenceDate);
  const periodEnd = getGoalPeriodEndDate(goal, referenceDate);

  return completions.filter((entry) => {
    const completionDate = startOfDay(parseISO(entry.completed_on));
    return !isBefore(completionDate, periodStart) && !isAfter(completionDate, periodEnd);
  });
}

export function isGoalDoneForCurrentPeriod(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): boolean {
  const today = toLocalDateString(referenceDate);
  const completedDates = completionSet(completions);

  if (goal.frequency_type === "fixed_milestones") {
    return completedDates.has(today);
  }

  return getCompletionsForCurrentPeriod(goal, completions, referenceDate).length > 0;
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
  referenceDate = new Date(),
  completionCount = 0
): boolean {
  if (goal.end_date && isPastDate(goal.end_date, referenceDate)) {
    return true;
  }

  if (goal.frequency_type === "fixed_milestones") {
    const targetCount = goal.target_count ?? 0;
    if (targetCount > 0 && completionCount >= targetCount) {
      return true;
    }
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
    return `${completionCount}/${goal.target_count ?? 0} milestones completed`;
  }

  const intervalLabel = getRecurringIntervalLabel(goal);

  if (goal.target_count !== null) {
    return `${intervalLabel} recurring · ${completionCount}/${goal.target_count} completions`;
  }

  return `${intervalLabel} recurring · ${completionCount} completions`;
}
