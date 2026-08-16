import type { MobileGoal } from "./checklist-lane-data";

export interface ChecklistVisibilityFilters {
  showPastGoals: boolean;
  showUpcomingGoals: boolean;
  showArchivedGoals: boolean;
  showCompletedGoals: boolean;
}

export interface ChecklistVisibilityCounts {
  past: number;
  upcoming: number;
  archived: number;
  completed: number;
}

export function filterMobileChecklistGoals({
  goals,
  completedGoalIds,
  asOfDate,
  filters,
}: {
  goals: MobileGoal[];
  completedGoalIds: ReadonlySet<string>;
  asOfDate: string;
  filters: ChecklistVisibilityFilters;
}): MobileGoal[] {
  return goals.filter((goal) => {
    if (goal.archived_at) {
      return filters.showArchivedGoals;
    }
    if (goal.start_date > asOfDate) {
      return filters.showUpcomingGoals;
    }
    if (goal.end_date && goal.end_date < asOfDate) {
      return filters.showPastGoals;
    }
    return !completedGoalIds.has(goal.id) || filters.showCompletedGoals;
  });
}

export function countMobileChecklistGoalVisibility({
  goals,
  completedGoalIds,
  asOfDate,
}: {
  goals: MobileGoal[];
  completedGoalIds: ReadonlySet<string>;
  asOfDate: string;
}): ChecklistVisibilityCounts {
  const counts: ChecklistVisibilityCounts = {
    past: 0,
    upcoming: 0,
    archived: 0,
    completed: 0,
  };
  for (const goal of goals) {
    if (goal.archived_at) {
      counts.archived += 1;
    } else if (goal.start_date > asOfDate) {
      counts.upcoming += 1;
    } else if (goal.end_date && goal.end_date < asOfDate) {
      counts.past += 1;
    } else if (completedGoalIds.has(goal.id)) {
      counts.completed += 1;
    }
  }
  return counts;
}
