import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { triggerLightPressFeedback } from "../../lib/haptics";
import { useSession } from "../../lib/session";

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

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function timezoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function useChecklistData() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const asOfDate = todayIso();
  const timezone = timezoneName();

  const goalsQuery = useQuery({
    queryKey: ["mobile-goals", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select(
          "id,owner_id,title,description,category,frequency_type,recurrence_interval,target_count,start_date,end_date,photo_path,archived_at,is_deleted"
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      return (data ?? []) as MobileGoal[];
    },
  });

  const progressQuery = useQuery({
    queryKey: ["mobile-progress", asOfDate, timezone],
    enabled: Boolean(userId),
    queryFn: () =>
      api.getJson<ProgressContextResponse>("/api/progress/context", {
        query: { asOfDate, timezone, viewDate: asOfDate },
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: {
      goalId: string;
      desiredFactState: "present" | "absent";
    }) => {
      triggerLightPressFeedback();
      return api.postJson("/api/completions", {
        goalId: input.goalId,
        date: asOfDate,
        desiredFactState: input.desiredFactState,
        timezone,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-progress"] });
    },
  });

  const facts = progressQuery.data?.facts ?? [];
  const completedToday = new Set(
    facts.filter((fact) => fact.completed_on === asOfDate).map((fact) => fact.goal_id)
  );
  const ownedGoals = (goalsQuery.data ?? []).filter(
    (goal) => goal.owner_id === userId && !goal.archived_at
  );

  return {
    asOfDate,
    timezone,
    loading: goalsQuery.isLoading || progressQuery.isLoading,
    error: goalsQuery.error ?? progressQuery.error,
    goals: ownedGoals,
    completedToday,
    toggle: toggleMutation.mutateAsync,
    toggling: toggleMutation.isPending,
    refresh: () => {
      void goalsQuery.refetch();
      void progressQuery.refetch();
    },
  };
}
