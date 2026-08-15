"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { withAbortSignal } from "@/lib/async/abort";
import { toLocalDateString } from "@/lib/dates/day";
import {
  fetchProgressContext,
  type ProgressContextResponse,
} from "@/lib/goals/progress-context";
import type { CompletionDateFact, Goal } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { useDuoLaneError } from "@/features/social/duo/use-duo-lane-error";
import { assertQueriesOk } from "@/lib/supabase/query-error";
import { selectViewerVisibleGoals } from "@cadence/shared/goals/visible-goals";
import { useDuo } from "@/features/social/duo/duo-context";

export interface InsightsData {
  userId: string;
  goals: Goal[];
  completions: CompletionDateFact[];
  memberTeamIds: string[];
  progress: ProgressContextResponse | null;
}

export const emptyInsights: InsightsData = {
  userId: "",
  goals: [],
  completions: [],
  memberTeamIds: [],
  progress: null,
};

const INSIGHTS_REQUEST_TIMEOUT_MS = 15_000;

export function useInsightsData({
  subjectUserId,
  selectedYear,
  failClosed = false,
}: {
  subjectUserId?: string;
  selectedYear: string;
  failClosed?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { viewerUserId, state: duoState } = useDuo();
  const partnerId = duoState.activePartner?.partnerId ?? null;
  const router = useRouter();
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const loadRequestIdRef = useRef(0);
  const visibleLoadCountRef = useRef(0);
  const authRedirectStartedRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (authRedirectStartedRef.current) {
      return;
    }
    authRedirectStartedRef.current = true;
    const nextPath =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;
    router.replace(buildLoginHref(nextPath));
  }, [router]);

  const { laneError, clearLaneError, reportLoadError } = useDuoLaneError({
    surface: "insights",
    failClosed,
    redirectToLogin,
    unavailableMessage: "Partner insights are unavailable.",
    timeoutMessage: "Insights request timed out. Please try again.",
    fallbackMessage: "Insights progress could not be loaded.",
  });

  const loadData = useCallback(
    async (
      {
        showLoading = true,
        forceRefresh = false,
      }: { showLoading?: boolean; forceRefresh?: boolean } = {}
    ) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      if (showLoading) {
        visibleLoadCountRef.current += 1;
        setLoading(true);
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        INSIGHTS_REQUEST_TIMEOUT_MS
      );
      try {
        const userId = viewerUserId
          ? viewerUserId
          : (
              await withAbortSignal(supabase.auth.getUser(), controller.signal)
            ).data.user?.id;

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (!userId) {
          setState(emptyInsights);
          redirectToLogin();
          return;
        }

        // PostgREST filter methods mutate and return the same builder, so this is
        // built fresh per load and only one branch below ever consumes it.
        const goalsQuery = supabase
          .from("goals")
          .select("*")
          .eq("is_deleted", false)
          .order("title");
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const targetSubjectUserId = subjectUserId ?? userId;
        const targetIsViewer = targetSubjectUserId === userId;
        const [goalsResponse, teamMembersResponse, progress] =
          await withAbortSignal(
            Promise.all([
              targetIsViewer
                ? goalsQuery
                : goalsQuery.eq("owner_id", targetSubjectUserId),
              targetIsViewer
                ? supabase.from("team_members").select("team_id").eq("user_id", userId)
                : Promise.resolve({ data: [], error: null }),
              fetchProgressContext({
                asOfDate: toLocalDateString(),
                factsFrom: yearStart,
                factsTo: yearEnd,
                subjectUserId: targetIsViewer ? undefined : targetSubjectUserId,
                forceRefresh,
              }),
            ]),
            controller.signal
          );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        assertQueriesOk(
          [goalsResponse, teamMembersResponse],
          "Insights goals could not be loaded."
        );

        const memberTeamIds = ((teamMembersResponse.data ?? []) as Array<{
          team_id: string;
        }>).map((row) => row.team_id);
        const goals = (goalsResponse.data ?? []) as Goal[];
        const visibleGoals = targetIsViewer
          ? selectViewerVisibleGoals({
              goals,
              partnerId,
              memberTeamIds,
            })
          : goals;

        setState({
          userId: targetSubjectUserId,
          goals: visibleGoals,
          completions: progress.facts,
          memberTeamIds,
          progress,
        });
        clearLaneError();
      } finally {
        window.clearTimeout(timeoutId);
        if (showLoading) {
          visibleLoadCountRef.current = Math.max(visibleLoadCountRef.current - 1, 0);
          if (visibleLoadCountRef.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [clearLaneError, partnerId, redirectToLogin, selectedYear, subjectUserId, supabase, viewerUserId]
  );

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } catch (error) {
        reportLoadError(error);
      }
    };

    void run();
  }, [loadData, reportLoadError]);

  return {
    state,
    loading,
    laneError,
    loadData,
    redirectToLogin,
  };
}
