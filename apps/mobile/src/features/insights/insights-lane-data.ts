import type { ProgressContextFact } from "@cadence/shared/goals/progress-context";
import { buildProgressContextQuery } from "@cadence/shared/goals/progress-context";
import { progressSubjectUserId } from "@cadence/shared/goals/visible-goals";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { buildMobileInsightsQueryKey } from "../duo/query-keys";

export function buildInsightsMonthWindow(month: string) {
  const monthDate = new Date(`${month}-01T00:00:00`);
  return {
    factsFrom: format(startOfMonth(monthDate), "yyyy-MM-dd"),
    factsTo: format(endOfMonth(monthDate), "yyyy-MM-dd"),
  };
}

export function buildInsightsLaneQueryKey({
  viewerUserId,
  subject,
  month,
}: {
  viewerUserId: string | null;
  subject: DuoLaneSubject;
  month: string;
}) {
  const { factsFrom, factsTo } = buildInsightsMonthWindow(month);
  return buildMobileInsightsQueryKey({
    viewerUserId,
    subjectUserId: subject.userId,
    factsFrom,
    factsTo,
  });
}

export function buildInsightsProgressQuery({
  asOfDate,
  timezone,
  subject,
  month,
}: {
  asOfDate: string;
  timezone: string;
  subject: DuoLaneSubject;
  month: string;
}) {
  const { factsFrom, factsTo } = buildInsightsMonthWindow(month);
  const resolvedSubjectUserId =
    subject.userId && subject.id
      ? progressSubjectUserId({
          targetIsViewer: subject.id === "viewer",
          targetSubjectUserId: subject.userId,
        })
      : undefined;
  return buildProgressContextQuery({
    asOfDate,
    timezone,
    factsFrom,
    factsTo,
    subjectUserId: resolvedSubjectUserId,
  });
}

export function countInsightsFactsByDay(facts: ProgressContextFact[]) {
  const map: Record<string, number> = {};
  for (const fact of facts) {
    map[fact.completed_on] = (map[fact.completed_on] ?? 0) + 1;
  }
  return map;
}

export interface InsightsMonthSummary {
  totalActivities: number;
  activeDays: number;
  peakDayActivities: number;
}

export function summarizeInsightsMonth(
  factsByDay: Record<string, number>
): InsightsMonthSummary {
  let totalActivities = 0;
  let activeDays = 0;
  let peakDayActivities = 0;
  for (const count of Object.values(factsByDay)) {
    if (count <= 0) {
      continue;
    }
    totalActivities += count;
    activeDays += 1;
    if (count > peakDayActivities) {
      peakDayActivities = count;
    }
  }
  return {
    totalActivities,
    activeDays,
    peakDayActivities,
  };
}
