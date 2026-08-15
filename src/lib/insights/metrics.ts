import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { getGoalCategoryLabel } from "@/lib/goals/category";
import { compareDateStrings } from "@/lib/goals/periods";
import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type { Completion, Goal } from "@/lib/goals/types";
import type {
  InsightsCategoryPoint,
  InsightsCountTrend,
  InsightsRateMetric,
  InsightsRateTrend,
  InsightsStatsGroup,
  InsightsWeekdayPoint,
} from "@/lib/insights/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface DayRate {
  numerator: number;
  denominator: number;
  rawCompletions: number;
}

function toDateString(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function getDateRange(startDate: string, endDate: string): string[] {
  if (compareDateStrings(startDate, endDate) > 0) {
    return [];
  }
  return eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map(toDateString);
}

function isGoalActiveOnDate(goal: Goal, date: string) {
  if (compareDateStrings(date, goal.start_date) < 0) {
    return false;
  }
  if (goal.end_date && compareDateStrings(date, goal.end_date) > 0) {
    return false;
  }
  return true;
}

function usesCompletionGatedDenominator(goal: Goal) {
  if (goal.frequency_type === "fixed_milestones") {
    return true;
  }
  return (
    goal.frequency_type === "recurring" &&
    (goal.recurrence_interval === "weekly" || goal.recurrence_interval === "monthly")
  );
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function toCountTrend(current: number, previous: number): InsightsCountTrend {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    deltaPercent: previous === 0 ? null : (delta / previous) * 100,
  };
}

function toRateTrend({
  currentNumerator,
  currentDenominator,
  previousNumerator,
  previousDenominator,
}: {
  currentNumerator: number;
  currentDenominator: number;
  previousNumerator: number;
  previousDenominator: number;
}): InsightsRateTrend {
  const percent = toPercent(currentNumerator, currentDenominator);
  const previousPercent = toPercent(previousNumerator, previousDenominator);
  return {
    numerator: currentNumerator,
    denominator: currentDenominator,
    percent,
    previousNumerator,
    previousDenominator,
    previousPercent,
    deltaPercentPoints: percent - previousPercent,
  };
}

function toRateMetric(numerator: number, denominator: number): InsightsRateMetric {
  return {
    numerator,
    denominator,
    percent: toPercent(numerator, denominator),
  };
}

function buildCompletionIndices(completions: Completion[]) {
  const rawCountByDate = new Map<string, number>();
  const uniqueGoalIdsByDate = new Map<string, Set<string>>();

  for (const completion of completions) {
    rawCountByDate.set(
      completion.completed_on,
      (rawCountByDate.get(completion.completed_on) ?? 0) + 1
    );
    const existing = uniqueGoalIdsByDate.get(completion.completed_on) ?? new Set<string>();
    existing.add(completion.goal_id);
    uniqueGoalIdsByDate.set(completion.completed_on, existing);
  }

  return {
    rawCountByDate,
    uniqueGoalIdsByDate,
  };
}

function sumRawCountsInWindow(
  rawCountByDate: Map<string, number>,
  startDate: string,
  endDate: string
) {
  let total = 0;
  for (const [date, count] of rawCountByDate.entries()) {
    if (date >= startDate && date <= endDate) {
      total += count;
    }
  }
  return total;
}

function sumRatesInWindow(dayRates: Map<string, DayRate>, startDate: string, endDate: string) {
  let numerator = 0;
  let denominator = 0;
  for (const [date, rate] of dayRates.entries()) {
    if (date >= startDate && date <= endDate) {
      numerator += rate.numerator;
      denominator += rate.denominator;
    }
  }
  return { numerator, denominator };
}

function buildDayRates({
  goals,
  days,
  uniqueGoalIdsByDate,
  rawCountByDate,
}: {
  goals: Goal[];
  days: string[];
  uniqueGoalIdsByDate: Map<string, Set<string>>;
  rawCountByDate: Map<string, number>;
}) {
  const rates = new Map<string, DayRate>();
  for (const day of days) {
    const completedGoalIds = uniqueGoalIdsByDate.get(day) ?? new Set<string>();
    let denominator = 0;
    for (const goal of goals) {
      if (!isGoalActiveOnDate(goal, day)) {
        continue;
      }
      if (usesCompletionGatedDenominator(goal)) {
        if (completedGoalIds.has(goal.id)) {
          denominator += 1;
        }
      } else {
        denominator += 1;
      }
    }
    rates.set(day, {
      numerator: completedGoalIds.size,
      denominator,
      rawCompletions: rawCountByDate.get(day) ?? 0,
    });
  }
  return rates;
}

function buildWeekdayBreakdown(dayRates: Map<string, DayRate>, days: string[]): InsightsWeekdayPoint[] {
  const totals = Array.from({ length: 7 }, () => ({
    numerator: 0,
    denominator: 0,
  }));
  for (const day of days) {
    const weekdayIndex = parseISO(day).getDay();
    const rate = dayRates.get(day);
    if (!rate) {
      continue;
    }
    totals[weekdayIndex].numerator += rate.numerator;
    totals[weekdayIndex].denominator += rate.denominator;
  }
  return totals.map((item, index) => ({
    weekdayIndex: index,
    weekdayLabel: WEEKDAY_LABELS[index],
    numerator: item.numerator,
    denominator: item.denominator,
    percent: toPercent(item.numerator, item.denominator),
  }));
}

function buildCategoryBreakdown({
  goals,
  days,
  uniqueGoalIdsByDate,
}: {
  goals: Goal[];
  days: string[];
  uniqueGoalIdsByDate: Map<string, Set<string>>;
}): InsightsCategoryPoint[] {
  const aggregates = new Map<
    string,
    { label: string; numerator: number; denominator: number }
  >();

  for (const goal of goals) {
    const categoryKey = goal.category_key?.trim() || "other";
    const categoryLabel = getGoalCategoryLabel(goal.category, goal.category_key);
    const bucket = aggregates.get(categoryKey) ?? {
      label: categoryLabel,
      numerator: 0,
      denominator: 0,
    };

    for (const day of days) {
      if (!isGoalActiveOnDate(goal, day)) {
        continue;
      }
      const completed = uniqueGoalIdsByDate.get(day)?.has(goal.id) ?? false;
      if (completed) {
        bucket.numerator += 1;
      }
      if (usesCompletionGatedDenominator(goal)) {
        if (completed) {
          bucket.denominator += 1;
        }
      } else {
        bucket.denominator += 1;
      }
    }

    aggregates.set(categoryKey, bucket);
  }

  return Array.from(aggregates.entries())
    .map(([categoryKey, bucket]) => ({
      categoryKey,
      categoryLabel: bucket.label,
      numerator: bucket.numerator,
      denominator: bucket.denominator,
      percent: toPercent(bucket.numerator, bucket.denominator),
    }))
    .sort((left, right) => {
      if (right.denominator !== left.denominator) {
        return right.denominator - left.denominator;
      }
      return left.categoryLabel.localeCompare(right.categoryLabel);
    });
}

function calculateActiveStreak(asOfDate: string, rawCountByDate: Map<string, number>) {
  let streak = 0;
  let cursor = asOfDate;
  for (;;) {
    const count = rawCountByDate.get(cursor) ?? 0;
    if (count <= 0) {
      break;
    }
    streak += 1;
    cursor = toDateString(addDays(parseISO(cursor), -1));
  }
  return streak;
}

function countDistinctActiveDaysInRange(
  rawCountByDate: Map<string, number>,
  startDate: string,
  endDate: string
) {
  let active = 0;
  for (const [date, count] of rawCountByDate.entries()) {
    if (count > 0 && date >= startDate && date <= endDate) {
      active += 1;
    }
  }
  return active;
}

export function buildInsightsStatsGroup({
  goals,
  completions,
  summariesByGoal,
  asOfDate,
  weekStartsOn,
  accountCreatedDate,
}: {
  goals: Goal[];
  completions: Completion[];
  summariesByGoal: Map<string, GoalProgressSnapshot>;
  asOfDate: string;
  weekStartsOn: number;
  accountCreatedDate: string;
}): InsightsStatsGroup {
  const { rawCountByDate, uniqueGoalIdsByDate } = buildCompletionIndices(completions);

  const weekStart = toDateString(
    startOfWeek(parseISO(asOfDate), {
      weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    })
  );
  const monthStart = toDateString(startOfMonth(parseISO(asOfDate)));
  const rolling30Start = toDateString(addDays(parseISO(asOfDate), -29));
  const previousRolling30Start = toDateString(addDays(parseISO(rolling30Start), -30));
  const previousRolling30End = toDateString(addDays(parseISO(rolling30Start), -1));

  const weekLength = getDateRange(weekStart, asOfDate).length;
  const monthLength = getDateRange(monthStart, asOfDate).length;
  const previousWeekStart = toDateString(addDays(parseISO(weekStart), -weekLength));
  const previousWeekEnd = toDateString(addDays(parseISO(weekStart), -1));
  const previousMonthStart = toDateString(addDays(parseISO(monthStart), -monthLength));
  const previousMonthEnd = toDateString(addDays(parseISO(monthStart), -1));

  const allDaysFromAccount = getDateRange(accountCreatedDate, asOfDate);
  const rolling30Days = getDateRange(rolling30Start, asOfDate);
  const previousRolling30Days = getDateRange(previousRolling30Start, previousRolling30End);
  const dayRates = buildDayRates({
    goals,
    days: [...allDaysFromAccount, ...previousRolling30Days],
    uniqueGoalIdsByDate,
    rawCountByDate,
  });

  const weekRate = sumRatesInWindow(dayRates, weekStart, asOfDate);
  const previousWeekRate = sumRatesInWindow(dayRates, previousWeekStart, previousWeekEnd);
  const monthRate = sumRatesInWindow(dayRates, monthStart, asOfDate);
  const previousMonthRate = sumRatesInWindow(dayRates, previousMonthStart, previousMonthEnd);
  const rolling30Rate = sumRatesInWindow(dayRates, rolling30Start, asOfDate);
  const previousRolling30Rate = sumRatesInWindow(
    dayRates,
    previousRolling30Start,
    previousRolling30End
  );

  const rolling30CompletionRateByDay = rolling30Days.map((date) => {
    const rate = dayRates.get(date) ?? { numerator: 0, denominator: 0, rawCompletions: 0 };
    return {
      date,
      completions: rate.rawCompletions,
      numerator: rate.numerator,
      denominator: rate.denominator,
      percent: toPercent(rate.numerator, rate.denominator),
    };
  });

  const totalActivities = completions.length;
  const totalGoalsCompleted = goals.reduce((count, goal) => {
    return (summariesByGoal.get(goal.id)?.outcome === "achieved" ? count + 1 : count);
  }, 0);
  const todayActivities = rawCountByDate.get(asOfDate) ?? 0;
  const activeStreakDays = calculateActiveStreak(asOfDate, rawCountByDate);

  const currentWeekActivitiesCount = sumRawCountsInWindow(rawCountByDate, weekStart, asOfDate);
  const previousWeekActivitiesCount = sumRawCountsInWindow(
    rawCountByDate,
    previousWeekStart,
    previousWeekEnd
  );
  const currentMonthActivitiesCount = sumRawCountsInWindow(rawCountByDate, monthStart, asOfDate);
  const previousMonthActivitiesCount = sumRawCountsInWindow(
    rawCountByDate,
    previousMonthStart,
    previousMonthEnd
  );
  const rolling30ActivitiesCount = sumRawCountsInWindow(rawCountByDate, rolling30Start, asOfDate);
  const previousRolling30ActivitiesCount = sumRawCountsInWindow(
    rawCountByDate,
    previousRolling30Start,
    previousRolling30End
  );

  const activeDays = countDistinctActiveDaysInRange(rawCountByDate, accountCreatedDate, asOfDate);
  const totalDays = allDaysFromAccount.length;

  return {
    totalActivities,
    totalGoalsCompleted,
    todayActivities,
    activeStreakDays,
    currentWeekActivities: toCountTrend(
      currentWeekActivitiesCount,
      previousWeekActivitiesCount
    ),
    currentMonthActivities: toCountTrend(
      currentMonthActivitiesCount,
      previousMonthActivitiesCount
    ),
    currentWeekCompletion: toRateTrend({
      currentNumerator: weekRate.numerator,
      currentDenominator: weekRate.denominator,
      previousNumerator: previousWeekRate.numerator,
      previousDenominator: previousWeekRate.denominator,
    }),
    currentMonthCompletion: toRateTrend({
      currentNumerator: monthRate.numerator,
      currentDenominator: monthRate.denominator,
      previousNumerator: previousMonthRate.numerator,
      previousDenominator: previousMonthRate.denominator,
    }),
    totalActiveDaysPercent: toRateMetric(activeDays, totalDays),
    totalDays,
    rolling30DaysActivities: toCountTrend(
      rolling30ActivitiesCount,
      previousRolling30ActivitiesCount
    ),
    rolling30DaysCompletion: toRateTrend({
      currentNumerator: rolling30Rate.numerator,
      currentDenominator: rolling30Rate.denominator,
      previousNumerator: previousRolling30Rate.numerator,
      previousDenominator: previousRolling30Rate.denominator,
    }),
    completionRateByDay: rolling30CompletionRateByDay,
    completionsPerDay: rolling30CompletionRateByDay.map((point) => ({
      date: point.date,
      value: point.completions,
    })),
    completionByWeekday: buildWeekdayBreakdown(dayRates, rolling30Days),
    completionRateByCategory: buildCategoryBreakdown({
      goals,
      days: rolling30Days,
      uniqueGoalIdsByDate,
    }),
  };
}
