import { resolveCategoryKey } from "@/lib/goals/category";
import { getGoalLifecycle } from "@/lib/goals/lifecycle";
import {
  filterGoalsByEndMonths,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import { isGoalManuallyArchived } from "@/lib/goals/schedule";
import type { Goal } from "@/lib/goals/types";

export type RecurrenceFilter = "all" | "daily" | "weekly" | "monthly" | "fixed";
export type RecurrenceGroup = "daily" | "weekly" | "monthly" | "fixed";

export const VISIBLE_GOALS_PER_GROUP = 4;
export const INITIAL_GROUP_EXPANDED: Record<RecurrenceGroup, boolean> = {
  daily: false,
  weekly: false,
  monthly: false,
  fixed: false,
};

export const recurrenceGroupOrder: RecurrenceGroup[] = [
  "daily",
  "weekly",
  "monthly",
  "fixed",
];

export const recurrenceGroupLabel: Record<RecurrenceGroup, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  fixed: "Milestones",
};

export const recurrenceFilterOptions: Array<{
  value: RecurrenceFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "fixed", label: "Milestones" },
];

export function getRecurrenceGroup(goal: Goal): RecurrenceGroup {
  if (goal.frequency_type === "fixed_milestones") {
    return "fixed";
  }
  if (goal.recurrence_interval === "weekly") {
    return "weekly";
  }
  if (goal.recurrence_interval === "monthly") {
    return "monthly";
  }
  return "daily";
}

export function matchesTodayFacetFilters({
  goal,
  categoryFilters,
  recurrenceFilters,
}: {
  goal: Goal;
  categoryFilters: string[];
  recurrenceFilters: RecurrenceGroup[];
}): boolean {
  if (categoryFilters.length > 0) {
    const allowedCategoryKeys = new Set(
      categoryFilters.map((categoryFilter) => resolveCategoryKey(categoryFilter))
    );
    const goalCategoryKey = resolveCategoryKey(goal.category_key ?? goal.category);
    if (!allowedCategoryKeys.has(goalCategoryKey)) {
      return false;
    }
  }

  if (recurrenceFilters.length > 0) {
    const recurrenceGroup = getRecurrenceGroup(goal);
    if (!recurrenceFilters.includes(recurrenceGroup)) {
      return false;
    }
  }

  return true;
}

export function selectActiveGoals({
  completableGoals,
  lifecycleByGoalAtViewDate,
}: {
  completableGoals: Goal[];
  lifecycleByGoalAtViewDate: Map<string, ReturnType<typeof getGoalLifecycle>>;
}): Goal[] {
  return completableGoals.filter((goal) => {
    const lifecycle = lifecycleByGoalAtViewDate.get(goal.id);
    return (
      lifecycle !== "ended" &&
      lifecycle !== "archived" &&
      !isGoalManuallyArchived(goal)
    );
  });
}

export function selectFilteredTodayGoals({
  activeGoals,
  todayDate,
  categoryFilters,
  recurrenceFilters,
  searchQuery,
  endMonths,
  completedTargetGoalIds = new Set<string>(),
  showCompletedGoals = true,
}: {
  activeGoals: Goal[];
  todayDate: string;
  categoryFilters: string[];
  recurrenceFilters: RecurrenceGroup[];
  searchQuery: string;
  endMonths: string[];
  completedTargetGoalIds?: ReadonlySet<string>;
  showCompletedGoals?: boolean;
}): Goal[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchingGoals = activeGoals
    .filter((goal) => goal.start_date <= todayDate)
    .filter((goal) => showCompletedGoals || !completedTargetGoalIds.has(goal.id))
    .filter((goal) =>
      matchesTodayFacetFilters({
        goal,
        categoryFilters,
        recurrenceFilters,
      })
    )
    .filter((goal) =>
      normalizedQuery.length === 0
        ? true
        : goal.title.toLowerCase().includes(normalizedQuery)
    );

  return filterGoalsByEndMonths(matchingGoals, endMonths);
}

export function groupGoalsByRecurrence(
  goals: Goal[],
  sort: GoalDateSort
): Array<{ key: RecurrenceGroup; label: string; goals: Goal[] }> {
  const grouped: Record<RecurrenceGroup, Goal[]> = {
    daily: [],
    weekly: [],
    monthly: [],
    fixed: [],
  };

  goals.forEach((goal) => {
    grouped[getRecurrenceGroup(goal)].push(goal);
  });

  return recurrenceGroupOrder
    .map((group) => ({
      key: group,
      label: recurrenceGroupLabel[group],
      goals: sortGoalsByDate(grouped[group], sort),
    }))
    .filter((group) => group.goals.length > 0);
}

export function selectEndedGoals({
  completableGoals,
  lifecycleByGoalAtViewDate,
}: {
  completableGoals: Goal[];
  lifecycleByGoalAtViewDate: Map<string, ReturnType<typeof getGoalLifecycle>>;
}): Goal[] {
  return completableGoals.filter((goal) => {
    if (isGoalManuallyArchived(goal)) {
      return false;
    }
    return lifecycleByGoalAtViewDate.get(goal.id) === "ended";
  });
}

export function selectArchivedGoals(completableGoals: Goal[]): Goal[] {
  return completableGoals.filter((goal) => isGoalManuallyArchived(goal));
}

export function selectUpcomingGoals(activeGoals: Goal[], todayDate: string): Goal[] {
  return activeGoals.filter((goal) => goal.start_date > todayDate);
}
