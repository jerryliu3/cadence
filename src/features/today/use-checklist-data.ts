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
import type {
  CompletionDateFact,
  Goal,
  GoalLink,
} from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";
import { useDuoLaneError } from "@/features/social/duo/use-duo-lane-error";
import { assertQueriesOk } from "@/lib/supabase/query-error";
import { useDuo } from "@/features/social/duo/duo-context";
import { selectViewerVisibleGoals } from "@cadence/shared/goals/visible-goals";

export interface TodayData {
  userId: string;
  goals: Goal[];
  completions: CompletionDateFact[];
  memberTeamIds: string[];
  links: GoalLink[];
  photoUrls: Record<string, string>;
  progress: ProgressContextResponse | null;
}

export const emptyTodayData: TodayData = {
  userId: "",
  goals: [],
  completions: [],
  memberTeamIds: [],
  links: [],
  photoUrls: {},
  progress: null,
};

const TODAY_REQUEST_TIMEOUT_MS = 15_000;

export function useChecklistData({
  subjectUserId,
  isActive,
  refreshToken,
  viewDate,
  failClosed = false,
}: {
  subjectUserId?: string;
  isActive: boolean;
  refreshToken: number;
  viewDate: string;
  failClosed?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { viewerUserId, state: duoState } = useDuo();
  const partnerId = duoState.activePartner?.partnerId ?? null;
  const router = useRouter();
  const [data, setData] = useState<TodayData>(emptyTodayData);
  const [loading, setLoading] = useState(true);
  const loadRequestIdRef = useRef(0);
  const viewDateProgressRequestIdRef = useRef(0);
  const visibleLoadCountRef = useRef(0);
  const refreshTokenRef = useRef(refreshToken);
  const pendingRefreshRef = useRef(false);
  const authRedirectStartedRef = useRef(false);
  const currentViewDateRef = useRef(viewDate);
  const previousViewDateRef = useRef(viewDate);
  const todayLocalDate = toLocalDateString();

  useEffect(() => {
    currentViewDateRef.current = viewDate;
  }, [viewDate]);

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
    surface: "checklist",
    failClosed,
    redirectToLogin,
    unavailableMessage: "Partner checklist is unavailable.",
    timeoutMessage: "Today goals request timed out. Please try again.",
    fallbackMessage: "Goal progress could not be loaded.",
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
        TODAY_REQUEST_TIMEOUT_MS
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
          setData(emptyTodayData);
          redirectToLogin();
          return;
        }

        // PostgREST filter methods mutate and return the same builder, so this is
        // built fresh per load and only one branch below ever consumes it.
        const goalsQuery = supabase
          .from("goals")
          .select("*")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
        const targetSubjectUserId = subjectUserId ?? userId;
        const targetIsViewer = targetSubjectUserId === userId;
        const [goalsResponse, teamMembersResponse, linksResponse, progress] =
          await withAbortSignal(
            Promise.all([
              targetIsViewer
                ? goalsQuery
                : goalsQuery.eq("owner_id", targetSubjectUserId),
              targetIsViewer
                ? supabase.from("team_members").select("team_id").eq("user_id", userId)
                : Promise.resolve({ data: [], error: null }),
              targetIsViewer
                ? supabase.from("goal_links").select("*").eq("owner_id", userId)
                : Promise.resolve({ data: [], error: null }),
              fetchProgressContext({
                asOfDate: todayLocalDate,
                viewDate: currentViewDateRef.current,
                subjectUserId: targetIsViewer ? undefined : targetSubjectUserId,
                forceRefresh,
              }),
            ]),
            controller.signal
          );

        assertQueriesOk(
          [goalsResponse, teamMembersResponse, linksResponse],
          "Checklist goals could not be loaded."
        );

        const goals = (goalsResponse.data ?? []) as Goal[];
        const completions = progress.facts;
        const memberTeamIds = ((teamMembersResponse.data ?? []) as Array<{
          team_id: string;
        }>).map((row) => row.team_id);
        const visibleGoals = selectViewerVisibleGoals({
          goals,
          partnerId: targetIsViewer ? partnerId : null,
        });
        const links = (linksResponse.data ?? []) as GoalLink[];

        const photoUrls: Record<string, string> = {};
        await withAbortSignal(
          Promise.all(
            visibleGoals
              .filter((goal) => goal.photo_path)
              .map(async (goal) => {
                if (!goal.photo_path) {
                  return;
                }
                const { data: signedData } = await supabase.storage
                  .from("goal-photos")
                  .createSignedUrl(goal.photo_path, 60 * 60);
                if (signedData?.signedUrl) {
                  photoUrls[goal.id] = signedData.signedUrl;
                }
              })
          ),
          controller.signal
        );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        setData({
          userId: targetSubjectUserId,
          goals: visibleGoals,
          completions,
          memberTeamIds,
          links,
          photoUrls,
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
    [clearLaneError, partnerId, redirectToLogin, subjectUserId, supabase, todayLocalDate, viewerUserId]
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

  useEffect(() => {
    if (!isActive || previousViewDateRef.current === viewDate) {
      return;
    }
    previousViewDateRef.current = viewDate;
    const requestId = viewDateProgressRequestIdRef.current + 1;
    viewDateProgressRequestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      void fetchProgressContext({
        asOfDate: todayLocalDate,
        viewDate,
        subjectUserId,
      })
        .then((progress) => {
          if (requestId !== viewDateProgressRequestIdRef.current) {
            return;
          }
          setData((previous) => ({
            ...previous,
            completions: progress.facts,
            progress,
          }));
        })
        .catch((error: unknown) => {
          reportLoadError(error);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isActive, reportLoadError, subjectUserId, todayLocalDate, viewDate]);

  useEffect(() => {
    if (refreshToken === refreshTokenRef.current) {
      return;
    }

    refreshTokenRef.current = refreshToken;
    if (isActive) {
      const timer = window.setTimeout(() => {
        void loadData({ showLoading: false, forceRefresh: true }).catch(
          (error: unknown) => {
            reportLoadError(error);
          }
        );
      }, 0);
      pendingRefreshRef.current = false;
      return () => window.clearTimeout(timer);
    }

    pendingRefreshRef.current = true;
  }, [isActive, loadData, refreshToken, reportLoadError]);

  useEffect(() => {
    if (!isActive || !pendingRefreshRef.current) {
      return;
    }
    pendingRefreshRef.current = false;
    const timer = window.setTimeout(() => {
      void loadData({ showLoading: false, forceRefresh: true }).catch(
        (error: unknown) => {
          reportLoadError(error);
        }
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isActive, loadData, reportLoadError]);

  return {
    data,
    loading,
    laneError,
    loadData,
    redirectToLogin,
    todayLocalDate,
  };
}
