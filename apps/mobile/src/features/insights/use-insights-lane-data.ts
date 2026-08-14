import type { ProgressContextResponse } from "@cadence/shared/goals/progress-context";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { duoQueryKeys } from "../duo/query-keys";
import {
  extractMobileDuoPartnerFailureContext,
  reportMobileDuoPartnerFetchFailure,
} from "../duo/telemetry";
import {
  buildInsightsLaneQueryKey,
  buildInsightsProgressQuery,
  countInsightsFactsByDay,
} from "./insights-lane-data";

function timezoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export interface InsightsLaneData {
  subject: DuoLaneSubject;
  loading: boolean;
  error: unknown;
  factsByDay: Record<string, number>;
  days: string[];
  offset: number;
  refresh: () => void;
}

function buildMonthCells(month: string) {
  const monthDate = new Date(`${month}-01T00:00:00`);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const days: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.push(format(cursor, "yyyy-MM-dd"));
  }
  const offset = (start.getDay() + 6) % 7;
  return { days, offset };
}

export function useInsightsLaneData({
  subject,
  month,
  enabled,
}: {
  subject: DuoLaneSubject;
  month: string;
  enabled: boolean;
}): InsightsLaneData {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const asOfDate = format(new Date(), "yyyy-MM-dd");
  const timezone = timezoneName();
  const subjectReady = subject.id === "viewer" ? Boolean(userId) : Boolean(subject.userId);
  const laneEnabled = Boolean(userId) && enabled && subjectReady;
  const reportedPartnerErrorAt = useRef(0);

  const query = useQuery({
    queryKey: buildInsightsLaneQueryKey({
      viewerUserId: userId,
      subject,
      month,
    }),
    enabled: laneEnabled,
    queryFn: () => {
      const params = buildInsightsProgressQuery({
        asOfDate,
        timezone,
        subject,
        month,
      });
      return api.getJson<ProgressContextResponse>("/api/progress/context", {
        query: Object.fromEntries(params.entries()),
      });
    },
  });

  useEffect(() => {
    if (
      subject.id !== "partner" ||
      !query.error ||
      query.errorUpdatedAt === 0 ||
      query.errorUpdatedAt === reportedPartnerErrorAt.current
    ) {
      return;
    }
    reportedPartnerErrorAt.current = query.errorUpdatedAt;
    const details = extractMobileDuoPartnerFailureContext(query.error);
    reportMobileDuoPartnerFetchFailure(query.error, {
      surface: "insights",
      ...details,
    });
  }, [query.error, query.errorUpdatedAt, subject.id]);

  const factsByDay = useMemo(
    () => countInsightsFactsByDay(query.data?.facts ?? []),
    [query.data?.facts]
  );
  const cells = useMemo(() => buildMonthCells(month), [month]);

  return {
    subject,
    loading: query.isLoading,
    error: query.error,
    factsByDay,
    days: cells.days,
    offset: cells.offset,
    refresh: () => {
      void queryClient.invalidateQueries({
        queryKey: duoQueryKeys.insightsPrefix(userId),
      });
    },
  };
}
