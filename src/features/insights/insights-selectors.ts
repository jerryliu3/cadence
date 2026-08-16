import {
  eachDayOfInterval,
  endOfYear,
  format,
  startOfYear,
} from "date-fns";
import {
  filterGoalsByEndMonths,
  partitionGoalsByVisibleStart,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import type { Goal } from "@/lib/goals/types";

export function selectSearchedGoals(goals: Goal[], query: string): Goal[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return goals;
  }
  return goals.filter((goal) =>
    goal.title.toLowerCase().includes(normalizedQuery)
  );
}

export function selectVisiblePerGoalHeatmaps({
  goals,
  visiblePeriodStart,
  endMonths,
  showHistoricalGoals,
  sort,
}: {
  goals: Goal[];
  visiblePeriodStart: string;
  endMonths: string[];
  showHistoricalGoals: boolean;
  sort: GoalDateSort;
}): {
  currentPeriodGoals: Goal[];
  historicalGoals: Goal[];
  visiblePerGoalHeatmaps: Goal[];
} {
  const filteredGoals = filterGoalsByEndMonths(goals, endMonths);
  const partitioned = partitionGoalsByVisibleStart(
    filteredGoals,
    visiblePeriodStart
  );
  const currentGoals = sortGoalsByDate(partitioned.current, sort);
  const historicalGoals = sortGoalsByDate(partitioned.historical, sort);
  return {
    currentPeriodGoals: currentGoals,
    historicalGoals,
    visiblePerGoalHeatmaps: showHistoricalGoals
      ? [...currentGoals, ...historicalGoals]
      : currentGoals,
  };
}

export function selectOverallCompletionPercent(
  goals: Array<{ id: string }>,
  progressByGoal: Map<string, { percent?: number } | undefined>
): number {
  if (goals.length === 0) {
    return 0;
  }
  return (
    goals.reduce(
      (total, goal) => total + (progressByGoal.get(goal.id)?.percent ?? 0),
      0
    ) / goals.length
  );
}

export function selectYearHeatmapValues(
  monthCursor: Date,
  countsByDate: Record<string, number>
): Array<{ date: string; count: number }> {
  return eachDayOfInterval({
    start: startOfYear(monthCursor),
    end: endOfYear(monthCursor),
  }).map((date) => {
    const key = format(date, "yyyy-MM-dd");
    return {
      date: key,
      count: countsByDate[key] ?? 0,
    };
  });
}
