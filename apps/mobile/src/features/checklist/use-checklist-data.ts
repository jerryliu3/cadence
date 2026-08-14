import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import { useState } from "react";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { triggerLightPressFeedback } from "../../lib/haptics";
import { useSession } from "../../lib/session";
import {
  buildMobileGoalsQueryKey,
  buildMobileProgressQueryKey,
  buildMobileTeamMembershipQueryKey,
  duoQueryKeys,
} from "../duo/query-keys";
import {
  CHECKLIST_COMPLETION_ERROR_MESSAGE,
  buildChecklistProgressQuery,
  countChecklistCompletionsForDate,
  isChecklistLaneInteractive,
  resolveChecklistCompletableGoalIds,
  selectChecklistGoalsForSubject,
  type MobileGoal,
} from "./checklist-lane-data";

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function timezoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export interface ChecklistLaneData {
  subject: DuoLaneSubject;
  loading: boolean;
  error: unknown;
  goals: MobileGoal[];
  completedToday: Set<string>;
  completionCount: number;
  goalCount: number;
  interactive: boolean;
  completableGoalIds: Set<string>;
  completionErrorMessage: string | null;
  canToggleGoal: (goalId: string) => boolean;
  toggle: ((input: { goalId: string; desiredFactState: "present" | "absent" }) => void) | null;
  toggling: boolean;
  refresh: () => void;
  progress: ProgressContextResponse | null;
}

export function useChecklistClock() {
  return {
    asOfDate: todayIso(),
    timezone: timezoneName(),
  };
}

export function useChecklistLaneData({
  subject,
  partnerId,
  enabled,
  includeGoals = true,
}: {
  subject: DuoLaneSubject;
  partnerId: string | null;
  enabled: boolean;
  includeGoals?: boolean;
}): ChecklistLaneData {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [completionErrorMessage, setCompletionErrorMessage] = useState<string | null>(null);
  const { asOfDate, timezone } = useChecklistClock();
  const interactive = isChecklistLaneInteractive(subject);
  const subjectReady = subject.id === "viewer" ? Boolean(userId) : Boolean(subject.userId);
  const laneEnabled = Boolean(userId) && enabled && subjectReady;
  const goalsEnabled = laneEnabled && includeGoals;

  const goalsQuery = useQuery({
    queryKey: buildMobileGoalsQueryKey({
      viewerUserId: userId,
      subjectUserId: subject.userId,
    }),
    enabled: goalsEnabled,
    queryFn: async () => {
      let goalsLoadQuery = supabase.from("goals").select(
          "id,owner_id,title,description,category,frequency_type,recurrence_interval,target_count,start_date,end_date,photo_path,archived_at,is_deleted"
        );
      if (subject.id === "partner" && partnerId) {
        goalsLoadQuery = goalsLoadQuery.eq("owner_id", partnerId);
      }
      const { data, error } = await goalsLoadQuery
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      return selectChecklistGoalsForSubject({
        goals: (data ?? []) as MobileGoal[],
        subject,
        partnerId,
      });
    },
  });
  const teamMembershipQuery = useQuery({
    queryKey: buildMobileTeamMembershipQueryKey({
      viewerUserId: userId,
      subjectUserId: subject.userId,
    }),
    enabled: laneEnabled && subject.id === "viewer",
    queryFn: async () => {
      if (!userId) {
        return [] as string[];
      }
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return ((data ?? []) as Array<{ team_id: string }>).map((row) => row.team_id);
    },
  });

  const progressQuery = useQuery({
    queryKey: buildMobileProgressQueryKey({
      viewerUserId: userId,
      subjectUserId: subject.userId,
      asOfDate,
      timezone,
    }),
    enabled: laneEnabled,
    queryFn: () => {
      const query = buildChecklistProgressQuery({
        asOfDate,
        timezone,
        subject,
      });
      return api.getJson<ProgressContextResponse>("/api/progress/context", {
        query: Object.fromEntries(query.entries()),
      });
    },
  });

  const toggleMutation = useMutation({
    onMutate: () => {
      setCompletionErrorMessage(null);
    },
    mutationFn: async (input: {
      goalId: string;
      desiredFactState: "present" | "absent";
    }) => {
      if (!interactive) {
        throw new Error("Checklist lane is read-only.");
      }
      triggerLightPressFeedback();
      return api.postJson("/api/completions", {
        goalId: input.goalId,
        date: asOfDate,
        desiredFactState: input.desiredFactState,
        timezone,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: duoQueryKeys.progressPrefix(userId),
      });
      setCompletionErrorMessage(null);
    },
    onError: () => {
      setCompletionErrorMessage(CHECKLIST_COMPLETION_ERROR_MESSAGE);
    },
  });

  const goals = goalsQuery.data ?? [];
  const completableGoalIds = resolveChecklistCompletableGoalIds({
    goals,
    subject,
    viewerUserId: userId,
    memberTeamIds: teamMembershipQuery.data ?? [],
  });
  const facts = progressQuery.data?.facts ?? [];
  const completedToday = new Set(
    facts.filter((fact) => fact.completed_on === asOfDate).map((fact) => fact.goal_id)
  );
  const canToggleGoal = (goalId: string) =>
    interactive && completableGoalIds.has(goalId);

  return {
    subject,
    loading:
      (goalsEnabled && goalsQuery.isLoading) ||
      (interactive && teamMembershipQuery.isLoading) ||
      progressQuery.isLoading,
    error: goalsQuery.error ?? teamMembershipQuery.error ?? progressQuery.error,
    goals,
    completedToday,
    completionCount: countChecklistCompletionsForDate({
      asOfDate,
      facts,
    }),
    goalCount: progressQuery.data?.summaries.length ?? 0,
    interactive,
    completableGoalIds,
    completionErrorMessage,
    canToggleGoal,
    toggle: interactive
      ? (input) => {
          if (!canToggleGoal(input.goalId)) {
            return;
          }
          toggleMutation.mutate(input);
        }
      : null,
    toggling: interactive && toggleMutation.isPending,
    refresh: () => {
      if (goalsEnabled) {
        void goalsQuery.refetch();
      }
      if (interactive) {
        void teamMembershipQuery.refetch();
      }
      void progressQuery.refetch();
    },
    progress: progressQuery.data ?? null,
  };
}
