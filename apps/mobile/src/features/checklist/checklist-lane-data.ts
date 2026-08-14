import type { ProgressContextFact, ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import { buildCompletableGoalIds } from "@cadence/shared/goals/completable-goals";
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
  team_id: string | null;
  photo_path: string | null;
  archived_at: string | null;
  is_deleted: boolean;
}

export const MOBILE_CHECKLIST_GOALS_SELECT =
  "id,owner_id,title,description,category,frequency_type,recurrence_interval,target_count,start_date,end_date,team_id,photo_path,archived_at,is_deleted";

export const CHECKLIST_COMPLETION_ERROR_MESSAGE =
  "Could not update completion. Try again.";

export function resolveTeamMembershipIds({
  rows,
  hasError,
}: {
  rows: Array<{ team_id: string }> | null;
  hasError: boolean;
}) {
  if (hasError) {
    return [] as string[];
  }
  return (rows ?? []).map((row) => row.team_id);
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

export function resolveChecklistCompletableGoalIds({
  goals,
  subject,
  viewerUserId,
  memberTeamIds,
}: {
  goals: MobileGoal[];
  subject: DuoLaneSubject;
  viewerUserId: string | null;
  memberTeamIds: Iterable<string>;
}) {
  if (!viewerUserId || subject.id !== "viewer" || subject.readOnly) {
    return new Set<string>();
  }
  return buildCompletableGoalIds({
    goals,
    userId: viewerUserId,
    memberTeamIds,
  });
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
