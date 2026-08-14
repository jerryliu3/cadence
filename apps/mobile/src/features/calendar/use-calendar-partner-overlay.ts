import { format } from "date-fns";
import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import { buildPartnerCompletionMarkersByDate } from "@cadence/shared/planner/partner-completion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { buildMobileCalendarOverlayQueryKey } from "../duo/query-keys";
import {
  extractMobileDuoPartnerFailureContext,
  reportMobileDuoPartnerFetchFailure,
} from "../duo/telemetry";
import {
  buildCalendarPartnerProgressQuery,
  resolveCalendarOverlayState,
  type CalendarOverlayPayload,
} from "./calendar-duo";

interface PartnerGoalTitleRow {
  id: string;
  owner_id: string;
  title: string;
}

function localAsOfDate() {
  return format(new Date(), "yyyy-MM-dd");
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function useCalendarPartnerOverlay({
  enabled,
  partnerId,
  month,
}: {
  enabled: boolean;
  partnerId: string | null;
  month: string;
}) {
  const { userId } = useSession();
  const progressParams = partnerId
    ? buildCalendarPartnerProgressQuery({
        month,
        asOfDate: localAsOfDate(),
        timezone: localTimezone(),
        partnerId,
      })
    : null;
  const queryEnabled = Boolean(userId) && enabled && Boolean(partnerId) && Boolean(progressParams);
  const reportedPartnerErrorAt = useRef(0);

  const query = useQuery({
    queryKey: buildMobileCalendarOverlayQueryKey({
      viewerUserId: userId,
      partnerUserId: partnerId,
      month,
    }),
    enabled: queryEnabled,
    queryFn: async (): Promise<CalendarOverlayPayload> => {
      if (!partnerId || !progressParams) {
        throw new Error("Partner calendar overlay request is missing bounds.");
      }
      const [progress, goalsResponse] = await Promise.all([
        api.getJson<ProgressContextResponse>("/api/progress/context", {
          query: Object.fromEntries(progressParams.entries()),
        }),
        supabase
          .from("goals")
          .select("id,owner_id,title")
          .eq("is_deleted", false)
          .eq("owner_id", partnerId),
      ]);
      if (goalsResponse.error) {
        throw goalsResponse.error;
      }
      const titleMap: Record<string, string> = {};
      for (const row of (goalsResponse.data ?? []) as PartnerGoalTitleRow[]) {
        if (row.owner_id === partnerId) {
          titleMap[row.id] = row.title;
        }
      }
      return {
        partnerId,
        month,
        markersByDate: buildPartnerCompletionMarkersByDate({
          facts: progress.facts,
          titles: titleMap,
        }),
      };
    },
  });

  useEffect(() => {
    if (
      !query.error ||
      query.errorUpdatedAt === 0 ||
      query.errorUpdatedAt === reportedPartnerErrorAt.current
    ) {
      return;
    }
    reportedPartnerErrorAt.current = query.errorUpdatedAt;
    const details = extractMobileDuoPartnerFailureContext(query.error);
    reportMobileDuoPartnerFetchFailure(query.error, {
      surface: "calendar",
      ...details,
    });
  }, [query.error, query.errorUpdatedAt]);

  return {
    ...resolveCalendarOverlayState({
      overlayEnabled: enabled,
      partnerId,
      month,
      data: query.data ?? null,
      loading: query.isLoading,
      error: query.error,
    }),
    loading: query.isLoading,
    refresh: query.refetch,
  };
}
