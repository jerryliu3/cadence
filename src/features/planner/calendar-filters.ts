import type { GoalCategoryFilterOption } from "@/features/goals/goal-filters";
import type { PlannerCompletionFactMarker } from "@/features/planner/calendar-surface.types";
import { mergeCompletionFactMarkers } from "@cadence/shared/planner/partner-completion";

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

export function applyCalendarCompletionMarkerFilters({
  viewerMarkers,
  partnerMarkers,
  goalPassesFilters,
}: {
  viewerMarkers: PlannerCompletionFactMarker[];
  partnerMarkers: PlannerCompletionFactMarker[];
  goalPassesFilters: (goalId: string) => boolean;
}) {
  const filteredViewerMarkers = viewerMarkers.filter((marker) =>
    goalPassesFilters(marker.originalGoalId)
  );
  // TODO(partner-filter-parity): Keep partner markers visible for now. Expand this
  // to full partner-aware filtering once we ship a parity UX that includes partner
  // goal metadata and explicit mixed-owner filter semantics.
  return mergeCompletionFactMarkers(filteredViewerMarkers, partnerMarkers);
}

