import { getGoalCategoryLabel } from "@/lib/goals/category";
import { getGoalLifecycle } from "@/lib/goals/lifecycle";
import {
  filterGoalsByEndMonth,
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
  categoryFilter,
  allCategoriesFilterValue,
  recurrenceFilter,
}: {
  goal: Goal;
  categoryFilter: string;
  allCategoriesFilterValue: string;
  recurrenceFilter: RecurrenceFilter;
}): boolean {
  const goalCategory = getGoalCategoryLabel(goal.category, goal.category_key);
  if (
    categoryFilter !== allCategoriesFilterValue &&
    goalCategory !== categoryFilter
  ) {
    return false;
  }

  if (recurrenceFilter !== "all") {
    if (recurrenceFilter === "fixed") {
      if (goal.frequency_type !== "fixed_milestones") {
        return false;
      }
    } else if (
      goal.frequency_type !== "recurring" ||
      goal.recurrence_interval !== recurrenceFilter
    ) {
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
  categoryFilter,
  allCategoriesFilterValue,
  recurrenceFilter,
  searchQuery,
  endMonth,
  completedTargetGoalIds = new Set<string>(),
  showCompletedGoals = true,
}: {
  activeGoals: Goal[];
  todayDate: string;
  categoryFilter: string;
  allCategoriesFilterValue: string;
  recurrenceFilter: RecurrenceFilter;
  searchQuery: string;
  endMonth: string | null;
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
        categoryFilter,
        allCategoriesFilterValue,
        recurrenceFilter,
      })
    )
    .filter((goal) =>
      normalizedQuery.length === 0
        ? true
        : goal.title.toLowerCase().includes(normalizedQuery)
    );

  return filterGoalsByEndMonth(matchingGoals, endMonth);
}

export function orderGoalsWithCurrentPeriodCompletedLast(
  goals: Goal[],
  completedCurrentGoalIds: ReadonlySet<string>
): Goal[] {
  if (goals.length === 0 || completedCurrentGoalIds.size === 0) {
    return goals;
  }

  const incompleteGoals: Goal[] = [];
  const completedGoals: Goal[] = [];

  for (const goal of goals) {
    if (completedCurrentGoalIds.has(goal.id)) {
      completedGoals.push(goal);
    } else {
      incompleteGoals.push(goal);
    }
  }

  return [...incompleteGoals, ...completedGoals];
}

export function groupGoalsByRecurrence(
  goals: Goal[],
  sort: GoalDateSort,
  completedCurrentGoalIds?: ReadonlySet<string>
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
      goals: orderGoalsWithCurrentPeriodCompletedLast(
        sortGoalsByDate(grouped[group], sort),
        completedCurrentGoalIds ?? new Set<string>()
      ),
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
