"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { isAbortError, withAbortSignal } from "@/lib/async/abort";
import { toLocalDateString } from "@/lib/dates/day";
import {
  fetchProgressContext,
  isProgressContextAuthenticationError,
  isProgressContextRequestError,
  type ProgressContextResponse,
} from "@/lib/goals/progress-context";
import { reportDuoPartnerFetchFailure } from "@/lib/social/duo/telemetry";
import type { CompletionDateFact, Goal } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { progressSubjectUserId, selectViewerVisibleGoals } from "@/lib/goals/visible-goals";
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
  const router = useRouter();
  const { state: duoState } = useDuo();
  const duoPartnerId = duoState.activePartner?.partnerId ?? null;
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [laneError, setLaneError] = useState<string | null>(null);
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
        const {
          data: { user },
          error: userError,
        } = await withAbortSignal(supabase.auth.getUser(), controller.signal);

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (userError || !user) {
          setState(emptyInsights);
          redirectToLogin();
          return;
        }

        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const targetSubjectUserId = subjectUserId ?? user.id;
        const targetIsViewer = targetSubjectUserId === user.id;
        const [goalsResponse, teamMembersResponse, progress] =
          await withAbortSignal(
            Promise.all([
              (() => {
                let query = supabase
                  .from("goals")
                  .select("*")
                  .eq("is_deleted", false)
                  .order("title");
                if (!targetIsViewer) {
                  query = query.eq("owner_id", targetSubjectUserId);
                }
                return query;
              })(),
              targetIsViewer
                ? supabase.from("team_members").select("team_id").eq("user_id", user.id)
                : Promise.resolve({ data: [], error: null }),
              fetchProgressContext({
                asOfDate: toLocalDateString(),
                factsFrom: yearStart,
                factsTo: yearEnd,
                subjectUserId: progressSubjectUserId({
                  targetIsViewer,
                  targetSubjectUserId,
                }),
                forceRefresh,
              }),
            ]),
            controller.signal
          );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        const memberTeamIds = ((teamMembersResponse.data ?? []) as Array<{
          team_id: string;
        }>).map((row) => row.team_id);
        const goals = (goalsResponse.data ?? []) as Goal[];
        const visibleGoals = targetIsViewer
          ? selectViewerVisibleGoals({ goals, partnerId: duoPartnerId })
          : goals;

        setState({
          userId: targetSubjectUserId,
          goals: visibleGoals,
          completions: progress.facts,
          memberTeamIds,
          progress,
        });
        setLaneError(null);
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
    [duoPartnerId, redirectToLogin, selectedYear, subjectUserId, supabase]
  );

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } catch (error) {
        if (isProgressContextAuthenticationError(error)) {
          redirectToLogin();
          return;
        }
        if (failClosed) {
          setLaneError("Partner insights are unavailable.");
          reportDuoPartnerFetchFailure(error, {
            surface: "insights",
            code: isProgressContextRequestError(error) ? error.code : undefined,
            status: isProgressContextRequestError(error) ? error.status : undefined,
            stalePartner: isProgressContextRequestError(error)
              ? error.code === "not_team_partner"
              : false,
          });
          return;
        }
        toast.error(
          isAbortError(error)
            ? "Insights request timed out. Please try again."
            : error instanceof Error
              ? error.message
              : "Insights progress could not be loaded."
        );
      }
    };

    void run();
  }, [failClosed, loadData, redirectToLogin]);

  return {
    state,
    loading,
    laneError,
    loadData,
    redirectToLogin,
  };
}
