import type { ProgressContextFact, ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import { buildProgressContextQuery } from "@cadence/shared/goals/progress-context";
import {
  progressSubjectUserId,
  selectViewerVisibleGoals,
} from "@cadence/shared/goals/visible-goals";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";

export interface MobileGoal {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string;
  frequency_type: "fixed_milestones" | "recurring";
  recurrence_interval: "daily" | "weekly" | "monthly" | null;
  target_count: number | null;
  start_date: string;
  end_date: string | null;
  photo_path: string | null;
  archived_at: string | null;
  is_deleted: boolean;
}

export function selectChecklistGoalsForSubject({
  goals,
  subject,
  partnerId,
}: {
  goals: MobileGoal[];
  subject: DuoLaneSubject;
  partnerId: string | null;
}): MobileGoal[] {
  const unarchivedGoals = goals.filter((goal) => !goal.archived_at);
  if (subject.id === "partner") {
    if (!partnerId) {
      return [];
    }
    return unarchivedGoals.filter((goal) => goal.owner_id === partnerId);
  }
  return selectViewerVisibleGoals({
    goals: unarchivedGoals,
    partnerId,
  });
}

export function buildChecklistProgressQuery({
  asOfDate,
  timezone,
  subject,
}: {
  asOfDate: string;
  timezone: string;
  subject: DuoLaneSubject;
}) {
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
    viewDate: asOfDate,
    subjectUserId: resolvedSubjectUserId,
  });
}

export function countChecklistCompletionsForDate({
  asOfDate,
  facts,
}: {
  asOfDate: string;
  facts: ProgressContextFact[];
}) {
  return facts.filter((fact) => fact.completed_on === asOfDate).length;
}

export function isChecklistLaneInteractive(subject: DuoLaneSubject) {
  return subject.id === "viewer" && !subject.readOnly;
}

export type PartnerChecklistStripState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; completionCount: number; goalCount: number };

export function resolvePartnerChecklistStripState({
  hasActivePartner,
  isLoading,
  error,
  progress,
  asOfDate,
}: {
  hasActivePartner: boolean;
  isLoading: boolean;
  error: unknown;
  progress: ProgressContextResponse | null;
  asOfDate: string;
}): PartnerChecklistStripState {
  if (!hasActivePartner) {
    return { status: "hidden" };
  }
  if (isLoading && !progress) {
    return { status: "loading" };
  }
  if (error || !progress) {
    return { status: "unavailable" };
  }
  return {
    status: "ready",
    completionCount: countChecklistCompletionsForDate({
      asOfDate,
      facts: progress.facts,
    }),
    goalCount: progress.summaries.length,
  };
}
