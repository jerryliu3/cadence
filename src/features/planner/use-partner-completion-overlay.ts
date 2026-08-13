"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchProgressContext,
  isProgressContextAuthenticationError,
  isProgressContextRequestError,
} from "@/lib/goals/progress-context";
import { toLocalDateString } from "@/lib/dates/day";
import type { Goal } from "@/lib/goals/types";
import { reportDuoPartnerFetchFailure } from "@/lib/social/duo/telemetry";
import type { PlannerCompletionFactMarker } from "@/features/planner/calendar-surface.types";
import {
  buildPartnerCompletionMarkersByDate,
  monthFactsBounds,
} from "@/features/planner/calendar-partner-overlay";

const EMPTY_MARKERS_BY_DATE = new Map<string, PlannerCompletionFactMarker[]>();

export function usePartnerCompletionOverlay({
  enabled,
  partnerId,
  month,
}: {
  enabled: boolean;
  partnerId: string | null | undefined;
  month: string | null;
}) {
  const [markersByDate, setMarkersByDate] = useState<
    Map<string, PlannerCompletionFactMarker[]>
  >(EMPTY_MARKERS_BY_DATE);
  const [error, setError] = useState<string | null>(null);
  // Freshness is derived on return rather than cleared in the effect: clearing
  // in an effect cascades an extra render and still leaves a window where the
  // previous subject's markers are visible.
  const [markersPartnerId, setMarkersPartnerId] = useState<string | null>(null);
  const [markersMonth, setMarkersMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !partnerId) {
      return;
    }
    const bounds = monthFactsBounds(month);
    if (!bounds) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const run = async () => {
      try {
        const [progress, goalsResponse] = await Promise.all([
          fetchProgressContext({
            asOfDate: toLocalDateString(),
            factsFrom: bounds.factsFrom,
            factsTo: bounds.factsTo,
            subjectUserId: partnerId,
          }),
          supabase
            .from("goals")
            .select("id,title")
            .eq("owner_id", partnerId)
            .eq("is_deleted", false),
        ]);
        if (cancelled) {
          return;
        }
        const titles: Record<string, string> = {};
        for (const goal of (goalsResponse.data ?? []) as Pick<Goal, "id" | "title">[]) {
          titles[goal.id] = goal.title;
        }
        setMarkersPartnerId(partnerId);
        setMarkersMonth(month);
        setMarkersByDate(
          buildPartnerCompletionMarkersByDate({
            facts: progress.facts,
            titles,
          })
        );
        setMarkersPartnerId(partnerId);
        setError(null);
      } catch (caught) {
        if (cancelled || isProgressContextAuthenticationError(caught)) {
          return;
        }
        setMarkersByDate(EMPTY_MARKERS_BY_DATE);
        setMarkersPartnerId(partnerId);
        setMarkersMonth(month);
        setError("Partner completions are unavailable.");
        reportDuoPartnerFetchFailure(caught, {
          surface: "calendar",
          code: isProgressContextRequestError(caught) ? caught.code : undefined,
          status: isProgressContextRequestError(caught) ? caught.status : undefined,
          stalePartner: isProgressContextRequestError(caught)
            ? caught.code === "not_team_partner"
            : false,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, month, partnerId]);

  const overlayActive = Boolean(enabled && partnerId && monthFactsBounds(month));
  const markersAreCurrent =
    overlayActive && markersPartnerId === partnerId && markersMonth === month;
  return {
    markersByDate: markersAreCurrent ? markersByDate : EMPTY_MARKERS_BY_DATE,
    error: markersAreCurrent ? error : null,
  };
}
