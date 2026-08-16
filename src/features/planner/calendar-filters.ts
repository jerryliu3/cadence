import type { GoalCategoryFilterOption } from "@/features/goals/goal-filters";

interface CalendarFilterGoalSnapshot {
  category: string;
  end_date?: string | null;
}

export function buildCalendarCategoryFilterOptions(
  goalsByOriginalId: Map<string, CalendarFilterGoalSnapshot>
): GoalCategoryFilterOption[] {
  const labels = new Set<string>();
  for (const goal of goalsByOriginalId.values()) {
    const normalized = goal.category.trim();
    if (normalized.length > 0) {
      labels.add(normalized);
    }
  }
  return Array.from(labels)
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ value: label, label }));
}

export function goalPassesCalendarFilters({
  goalId,
  goalsByOriginalId,
  categoryFilter,
  allCategoriesValue,
  endMonthFilter,
}: {
  goalId: string;
  goalsByOriginalId: Map<string, CalendarFilterGoalSnapshot>;
  categoryFilter: string;
  allCategoriesValue: string;
  endMonthFilter: string | null;
}) {
  const hasActiveFilters =
    categoryFilter !== allCategoriesValue || endMonthFilter !== null;
  const goal = goalsByOriginalId.get(goalId) ?? null;
  if (!goal) {
    return !hasActiveFilters;
  }
  if (
    categoryFilter !== allCategoriesValue &&
    goal.category.trim() !== categoryFilter
  ) {
    return false;
  }
  if (endMonthFilter !== null) {
    return goal.end_date?.slice(0, 7) === endMonthFilter;
  }
  return true;
}

