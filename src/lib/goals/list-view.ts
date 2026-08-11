import { eachMonthOfInterval, format, parseISO, startOfMonth } from "date-fns";
import type { Goal } from "@/lib/goals/types";

export type GoalDateSort =
  | "earliest_end"
  | "latest_end"
  | "earliest_start"
  | "latest_start";

export interface GoalMonthOption {
  label: string;
  value: string;
}

export const goalDateSortOptions: Array<{ label: string; value: GoalDateSort }> = [
  { label: "Earliest end date", value: "earliest_end" },
  { label: "Latest end date", value: "latest_end" },
  { label: "Earliest start date", value: "earliest_start" },
  { label: "Latest start date", value: "latest_start" },
];

function compareTitles(left: Goal, right: Goal): number {
  const titleComparison = left.title.localeCompare(right.title);
  return titleComparison !== 0 ? titleComparison : left.id.localeCompare(right.id);
}

function compareRequiredDates(
  left: Goal,
  right: Goal,
  field: "start_date",
  direction: 1 | -1
): number {
  const dateComparison = left[field].localeCompare(right[field]) * direction;
  return dateComparison !== 0 ? dateComparison : compareTitles(left, right);
}

function compareOptionalDates(
  left: Goal,
  right: Goal,
  field: "end_date",
  direction: 1 | -1
): number {
  const leftDate = left[field];
  const rightDate = right[field];

  if (leftDate === null && rightDate === null) {
    return compareTitles(left, right);
  }

  if (leftDate === null) {
    return 1;
  }

  if (rightDate === null) {
    return -1;
  }

  const dateComparison = leftDate.localeCompare(rightDate) * direction;
  return dateComparison !== 0 ? dateComparison : compareTitles(left, right);
}

export function compareGoalsByDate(
  left: Goal,
  right: Goal,
  sort: GoalDateSort
): number {
  switch (sort) {
    case "latest_end":
      return compareOptionalDates(left, right, "end_date", -1);
    case "earliest_start":
      return compareRequiredDates(left, right, "start_date", 1);
    case "latest_start":
      return compareRequiredDates(left, right, "start_date", -1);
    case "earliest_end":
    default:
      return compareOptionalDates(left, right, "end_date", 1);
  }
}

export function sortGoalsByDate(goals: Goal[], sort: GoalDateSort): Goal[] {
  return [...goals].sort((left, right) => compareGoalsByDate(left, right, sort));
}

export function filterGoalsByEndMonth(goals: Goal[], endMonth: string | null): Goal[] {
  if (endMonth === null) {
    return goals;
  }

  return goals.filter(
    (goal) => goal.end_date !== null && goal.end_date.slice(0, 7) === endMonth
  );
}

export function resolveEffectiveEndMonth(
  endMonth: string | null,
  referenceMonth: string
): string | null {
  if (endMonth === null) {
    return null;
  }
  return endMonth >= referenceMonth ? endMonth : null;
}

export function partitionGoalsByVisibleStart(
  goals: Goal[],
  visibleStart: string
): { current: Goal[]; historical: Goal[] } {
  const current: Goal[] = [];
  const historical: Goal[] = [];

  goals.forEach((goal) => {
    if (goal.end_date !== null && goal.end_date < visibleStart) {
      historical.push(goal);
      return;
    }

    current.push(goal);
  });

  return { current, historical };
}

export function buildGoalMonthOptions(
  goals: Goal[],
  startMonth: string,
  upperBoundMonths: string[] = []
): GoalMonthOption[] {
  if (!/^\d{4}-\d{2}$/.test(startMonth)) {
    return [];
  }

  const monthValues = [
    ...goals.flatMap((goal) => (goal.end_date ? [goal.end_date.slice(0, 7)] : [])),
    ...upperBoundMonths,
  ].filter((month) => /^\d{4}-\d{2}$/.test(month) && month >= startMonth);
  const lastMonth = monthValues.reduce(
    (latest, month) => (month > latest ? month : latest),
    startMonth
  );

  return eachMonthOfInterval({
    start: startOfMonth(parseISO(`${startMonth}-01`)),
    end: startOfMonth(parseISO(`${lastMonth}-01`)),
  }).map((date) => ({
    label: format(date, "MMMM yyyy"),
    value: format(date, "yyyy-MM"),
  }));
}
