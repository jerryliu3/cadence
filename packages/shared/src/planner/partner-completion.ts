import { addDays, format, parseISO, startOfMonth } from "date-fns";
import type { ProgressContextFact } from "../goals/progress-context";
import type { PlannerCompletionFactMarker } from "./context";

/**
 * The month grid is a fixed 42-cell window whose first cell is the start of the
 * week containing the 1st, so it renders up to 6 leading days from the previous
 * month and trailing days from the next one (see buildMonthCells).
 *
 * Bounding the fetch to the calendar month would leave those cells permanently
 * empty of partner markers. Fetch the widest grid any weekStartsOn can produce
 * instead — 6 days before the 1st through 41 days after it. That is a superset
 * of every variant, so the hook does not need the viewer's week-start
 * preference, and dates outside the rendered grid are simply never looked up.
 */
export function monthGridFactsBounds(month: string | null): {
  factsFrom: string;
  factsTo: string;
} | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const monthStart = startOfMonth(parseISO(`${month}-01`));
  return {
    factsFrom: format(addDays(monthStart, -6), "yyyy-MM-dd"),
    factsTo: format(addDays(monthStart, 41), "yyyy-MM-dd"),
  };
}

export function buildPartnerCompletionMarkersByDate({
  facts,
  titles,
}: {
  facts: ProgressContextFact[];
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
