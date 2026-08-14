import { format } from "date-fns";
import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import {
  extractMobileDuoPartnerFailureContext,
  reportMobileDuoPartnerFetchFailure,
} from "../duo/telemetry";
import {
  buildCalendarPartnerOverlayPayload,
  buildCalendarOverlayQueryModel,
  resolveCalendarOverlayState,
  type CalendarPartnerGoalTitleRow,
  type CalendarOverlayPayload,
} from "./calendar-duo";

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
  const asOfDate = localAsOfDate();
  const timezone = localTimezone();
  const queryModel = buildCalendarOverlayQueryModel({
    viewerUserId: userId,
    enabled,
    partnerId,
    month,
    asOfDate,
    timezone,
  });
  const reportedPartnerErrorAt = useRef(0);

  const query = useQuery({
    queryKey: queryModel.queryKey,
    enabled: queryModel.queryEnabled,
    queryFn: async (): Promise<CalendarOverlayPayload> => {
      if (!partnerId || !queryModel.progressParams) {
        throw new Error("Partner calendar overlay request is missing bounds.");
      }
      const [progress, goalsResponse] = await Promise.all([
        api.getJson<ProgressContextResponse>("/api/progress/context", {
          query: Object.fromEntries(queryModel.progressParams.entries()),
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
      return buildCalendarPartnerOverlayPayload({
        partnerId,
        month,
        facts: progress.facts,
        goalRows: (goalsResponse.data ?? []) as CalendarPartnerGoalTitleRow[],
      });
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
  };
}
