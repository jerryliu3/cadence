import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import type { PlannerCompletionFactMarker } from "@/features/planner/calendar-surface.types";
import type { CompletionDateFact } from "@/lib/goals/types";

export function monthFactsBounds(month: string | null): {
  factsFrom: string;
  factsTo: string;
} | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const monthDate = parseISO(`${month}-01`);
  return {
    factsFrom: format(startOfMonth(monthDate), "yyyy-MM-dd"),
    factsTo: format(endOfMonth(monthDate), "yyyy-MM-dd"),
  };
}

export function buildPartnerCompletionMarkersByDate({
  facts,
  titles,
}: {
  facts: CompletionDateFact[];
  titles: Record<string, string>;
}): Map<string, PlannerCompletionFactMarker[]> {
  const map = new Map<string, PlannerCompletionFactMarker[]>();
  for (const fact of facts) {
    const markersForDay = map.get(fact.completed_on) ?? [];
    markersForDay.push({
      key: `partner:${fact.goal_id}:${fact.completed_on}:${fact.source}`,
      originalGoalId: fact.goal_id,
      unitKey: "partner-fact",
      goalTitle: titles[fact.goal_id] ?? "Completed",
      scheduledDate: fact.completed_on,
      owner: "partner",
    });
    map.set(fact.completed_on, markersForDay);
  }
  for (const markersForDay of map.values()) {
    markersForDay.sort((left, right) => left.goalTitle.localeCompare(right.goalTitle));
  }
  return map;
}

export function mergeCompletionFactMarkers(
  viewerMarkers: PlannerCompletionFactMarker[],
  partnerMarkers: PlannerCompletionFactMarker[]
): PlannerCompletionFactMarker[] {
  if (partnerMarkers.length === 0) {
    return viewerMarkers;
  }
  if (viewerMarkers.length === 0) {
    return partnerMarkers;
  }
  return [...viewerMarkers, ...partnerMarkers];
}
