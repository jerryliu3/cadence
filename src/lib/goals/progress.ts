import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { toLocalDateString } from "@/lib/dates/day";
import type { Completion, Goal } from "@/lib/goals/types";
import { getPeriodKeyForGoal } from "@/lib/goals/schedule";

function clampDateByGoalWindow(goal: Goal, referenceDate: Date): Date {
  const start = startOfDay(parseISO(goal.start_date));
  const capByEndDate =
    goal.end_date !== null ? startOfDay(parseISO(goal.end_date)) : referenceDate;
  const bounded = isAfter(referenceDate, capByEndDate) ? capByEndDate : referenceDate;
  return isBefore(bounded, start) ? start : bounded;
}

function getRecurringExpectedPeriods(goal: Goal, referenceDate = new Date()): number {
  const start = startOfDay(parseISO(goal.start_date));
  const end = clampDateByGoalWindow(goal, startOfDay(referenceDate));

  if (goal.recurrence_interval === "weekly") {
    return (
      differenceInCalendarWeeks(startOfISOWeek(end), startOfISOWeek(start), {
        weekStartsOn: 1,
      }) + 1
    );
  }

  if (goal.recurrence_interval === "monthly") {
    return (
      differenceInCalendarMonths(startOfMonth(end), startOfMonth(start)) + 1
    );
  }

  return differenceInCalendarDays(end, start) + 1;
}

function getDistinctCompletedPeriods(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): number {
  const end = clampDateByGoalWindow(goal, startOfDay(referenceDate));
  const start = startOfDay(parseISO(goal.start_date));
  const keys = new Set<string>();

  completions.forEach((entry) => {
    const completionDate = startOfDay(parseISO(entry.completed_on));
    if (isBefore(completionDate, start) || isAfter(completionDate, end)) {
      return;
    }

    keys.add(getPeriodKeyForGoal(goal, entry.completed_on));
  });

  return keys.size;
}

export function getGoalCompletionPercentage(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): number {
  if (goal.frequency_type === "fixed_milestones") {
    const target = goal.target_count ?? 1;
    return Math.min(100, (completions.length / target) * 100);
  }

  const expected = Math.max(1, getRecurringExpectedPeriods(goal, referenceDate));
  const completedPeriods = getDistinctCompletedPeriods(goal, completions, referenceDate);

  return Math.min(100, (completedPeriods / expected) * 100);
}

export function getOverallCompletionPercentage(
  goals: Goal[],
  completionsByGoal: Map<string, Completion[]>,
  referenceDate = new Date()
): number {
  if (goals.length === 0) {
    return 0;
  }

  const total = goals.reduce((accumulator, goal) => {
    const completions = completionsByGoal.get(goal.id) ?? [];
    return accumulator + getGoalCompletionPercentage(goal, completions, referenceDate);
  }, 0);

  return total / goals.length;
}

function getPeriodStartDate(goal: Goal, completionDate: string): Date {
  const date = startOfDay(parseISO(completionDate));

  if (goal.recurrence_interval === "weekly") {
    return startOfISOWeek(date);
  }

  if (goal.recurrence_interval === "monthly") {
    return startOfMonth(date);
  }

  return date;
}

function getNextPeriodStart(goal: Goal, periodStart: Date): Date {
  if (goal.recurrence_interval === "weekly") {
    return addWeeks(periodStart, 1);
  }

  if (goal.recurrence_interval === "monthly") {
    return addMonths(periodStart, 1);
  }

  return addDays(periodStart, 1);
}

export function getRecurringStreaks(
  goal: Goal,
  completions: Completion[],
  referenceDate = new Date()
): { current: number; longest: number } {
  if (goal.frequency_type !== "recurring") {
    return { current: 0, longest: 0 };
  }

  const uniqueStarts = Array.from(
    new Set(completions.map((entry) => getPeriodKeyForGoal(goal, entry.completed_on)))
  )
    .map((key) => {
      if (goal.recurrence_interval === "weekly") {
        const [yearText, weekText] = key.split("-W");
        const base = new Date(Number.parseInt(yearText, 10), 0, 4);
        const weekStart = startOfISOWeek(addWeeks(base, Number.parseInt(weekText, 10) - 1));
        return weekStart;
      }

      if (goal.recurrence_interval === "monthly") {
        return parseISO(`${key}-01`);
      }

      return parseISO(key);
    })
    .sort((a, b) => a.getTime() - b.getTime());

  if (uniqueStarts.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let running = 1;

  for (let index = 1; index < uniqueStarts.length; index += 1) {
    const previous = uniqueStarts[index - 1];
    const expected = getNextPeriodStart(goal, previous);
    const current = uniqueStarts[index];
    const contiguous = current.getTime() === expected.getTime();

    running = contiguous ? running + 1 : 1;
    longest = Math.max(longest, running);
  }

  const currentPeriod = getPeriodStartDate(
    goal,
    toLocalDateString(referenceDate)
  );
  const lastCompleted = uniqueStarts[uniqueStarts.length - 1];
  let current = 0;

  if (lastCompleted.getTime() === currentPeriod.getTime()) {
    current = 1;

    for (
      let index = uniqueStarts.length - 2;
      index >= 0;
      index -= 1
    ) {
      const expected = getNextPeriodStart(goal, uniqueStarts[index]);
      const next = uniqueStarts[index + 1];
      if (expected.getTime() !== next.getTime()) {
        break;
      }
      current += 1;
    }
  }

  return { current, longest };
}
