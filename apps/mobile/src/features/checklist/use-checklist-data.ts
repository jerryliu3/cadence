import { format } from "date-fns";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import { useState } from "react";
import { api } from "../../lib/api";
import { sanitizeMobileSupabaseError } from "../../lib/supabase-error";
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
  MOBILE_CHECKLIST_GOALS_SELECT,
  buildChecklistProgressQuery,
  countChecklistCompletionsForDate,
  isChecklistLaneInteractive,
  latestCompletionDateByGoal,
  resolveChecklistCompletableGoalIds,
  resolveChecklistMutationDate,
  resolveTeamMembershipIds,
  selectChecklistGoalsForSubject,
  shouldReportViewerLaneCompletion,
  type MobileGoal,
} from "./checklist-lane-data";
import {
  extractMobileDuoPartnerFailureContext,
  reportMobileDuoPartnerFetchFailure,
  reportMobileDuoTelemetry,
} from "../duo/telemetry";

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
  completedForView: Set<string>;
  completionDateByGoal: Map<string, string>;
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
  const reportedPartnerGoalsErrorAt = useRef(0);
  const reportedPartnerProgressErrorAt = useRef(0);

  const goalsQuery = useQuery({
    queryKey: buildMobileGoalsQueryKey({
      viewerUserId: userId,
      subjectUserId: subject.userId,
    }),
    enabled: goalsEnabled,
    queryFn: async () => {
      let goalsLoadQuery = supabase.from("goals").select(
          MOBILE_CHECKLIST_GOALS_SELECT
        );
      if (subject.id === "partner" && partnerId) {
        goalsLoadQuery = goalsLoadQuery.eq("owner_id", partnerId);
      }
      const { data, error } = await goalsLoadQuery
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) {
        throw sanitizeMobileSupabaseError({
          error,
          userMessage: "Checklist goals could not be loaded.",
        });
      }
      return (data ?? []) as MobileGoal[];
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
      return resolveTeamMembershipIds({
        rows: (data ?? null) as Array<{ team_id: string }> | null,
        hasError: Boolean(error),
      });
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

  useEffect(() => {
    if (
      subject.id !== "partner" ||
      !goalsQuery.error ||
      goalsQuery.errorUpdatedAt === 0 ||
      goalsQuery.errorUpdatedAt === reportedPartnerGoalsErrorAt.current
    ) {
      return;
    }
    reportedPartnerGoalsErrorAt.current = goalsQuery.errorUpdatedAt;
    const details = extractMobileDuoPartnerFailureContext(goalsQuery.error);
    reportMobileDuoPartnerFetchFailure(goalsQuery.error, {
      surface: "checklist",
      ...details,
    });
  }, [goalsQuery.error, goalsQuery.errorUpdatedAt, subject.id]);

  useEffect(() => {
    if (
      subject.id !== "partner" ||
      !progressQuery.error ||
      progressQuery.errorUpdatedAt === 0 ||
      progressQuery.errorUpdatedAt === reportedPartnerProgressErrorAt.current
    ) {
      return;
    }
    reportedPartnerProgressErrorAt.current = progressQuery.errorUpdatedAt;
    const details = extractMobileDuoPartnerFailureContext(progressQuery.error);
    reportMobileDuoPartnerFetchFailure(progressQuery.error, {
      surface: "checklist",
      ...details,
    });
  }, [progressQuery.error, progressQuery.errorUpdatedAt, subject.id]);

  const memberTeamIds = teamMembershipQuery.data ?? [];
  const goals = selectChecklistGoalsForSubject({
    goals: goalsQuery.data ?? [],
    subject,
    partnerId,
    memberTeamIds,
  });
  const facts = progressQuery.data?.facts ?? [];
  const completedForView = new Set(facts.map((fact) => fact.goal_id));
  const completionDateByGoal = latestCompletionDateByGoal(facts);

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
        date: resolveChecklistMutationDate({
          goalId: input.goalId,
          desiredFactState: input.desiredFactState,
          asOfDate,
          completionDateByGoal,
        }),
        desiredFactState: input.desiredFactState,
        timezone,
      });
    },
    onSuccess: async (_response, input) => {
      if (
        shouldReportViewerLaneCompletion({
          interactive,
          desiredFactState: input.desiredFactState,
        })
      ) {
        reportMobileDuoTelemetry("viewer_lane_completion", {
          surface: "checklist",
        });
      }
      await queryClient.invalidateQueries({
        queryKey: duoQueryKeys.progressPrefix(userId),
      });
      setCompletionErrorMessage(null);
    },
    onError: () => {
      setCompletionErrorMessage(CHECKLIST_COMPLETION_ERROR_MESSAGE);
    },
  });

  const completableGoalIds = resolveChecklistCompletableGoalIds({
    goals,
    subject,
    viewerUserId: userId,
    memberTeamIds,
  });
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
    completedForView,
    completionDateByGoal,
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
