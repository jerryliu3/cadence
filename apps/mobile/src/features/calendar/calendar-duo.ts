import { buildProgressContextQuery } from "@cadence/shared/goals/progress-context";
import { progressSubjectUserId } from "@cadence/shared/goals/visible-goals";
import type { PlannerCompletionFactMarker } from "@cadence/shared/planner/context";
import type { ProgressContextFact } from "@cadence/shared/goals/progress-context";
import {
  buildPartnerCompletionMarkersByDate,
  monthGridFactsBounds,
} from "@cadence/shared/planner/partner-completion";
import type { DuoScope } from "@cadence/shared/social/duo";
import { buildMobileCalendarOverlayQueryKey } from "../duo/query-keys";

const EMPTY_CALENDAR_MARKERS_BY_DATE = new Map<
  string,
  PlannerCompletionFactMarker[]
>();
export const PARTNER_CALENDAR_UNAVAILABLE_MESSAGE =
  "Partner completions are unavailable.";

export interface CalendarOverlayPayload {
  partnerId: string;
  month: string;
  markersByDate: Map<string, PlannerCompletionFactMarker[]>;
}

export interface CalendarPartnerGoalTitleRow {
  id: string;
  owner_id: string;
  title: string;
}

export function buildCalendarOverlayQueryModel({
  viewerUserId,
  enabled,
  partnerId,
  month,
  asOfDate,
  timezone,
}: {
  viewerUserId: string | null;
  enabled: boolean;
  partnerId: string | null;
  month: string;
  asOfDate: string;
  timezone: string;
}) {
  const progressParams = partnerId
    ? buildCalendarPartnerProgressQuery({
        month,
        asOfDate,
        timezone,
        partnerId,
      })
    : null;

  return {
    queryKey: buildMobileCalendarOverlayQueryKey({
      viewerUserId,
      partnerUserId: partnerId,
      month,
      asOfDate,
      timezone,
    }),
    progressParams,
    queryEnabled:
      Boolean(viewerUserId) && enabled && Boolean(partnerId) && Boolean(progressParams),
  };
}

export function buildCalendarPartnerTitleMap({
  rows,
  partnerId,
}: {
  rows: CalendarPartnerGoalTitleRow[];
  partnerId: string;
}) {
  const titleMap: Record<string, string> = {};
  for (const row of rows) {
    // Defense in depth: only map partner-owned rows even if upstream filters drift.
    if (row.owner_id === partnerId) {
      titleMap[row.id] = row.title;
    }
  }
  return titleMap;
}

export function buildCalendarPartnerOverlayPayload({
  partnerId,
  month,
  facts,
  goalRows,
}: {
  partnerId: string;
  month: string;
  facts: ProgressContextFact[];
  goalRows: CalendarPartnerGoalTitleRow[];
}): CalendarOverlayPayload {
  return {
    partnerId,
    month,
    markersByDate: buildPartnerCompletionMarkersByDate({
      facts,
      titles: buildCalendarPartnerTitleMap({
        rows: goalRows,
        partnerId,
      }),
    }),
  };
}

export function buildCalendarPartnerProgressQuery({
  month,
  asOfDate,
  timezone,
  partnerId,
}: {
  month: string | null;
  asOfDate: string;
  timezone: string;
  partnerId: string;
}) {
  const bounds = monthGridFactsBounds(month);
  if (!bounds) {
    return null;
  }
  return buildProgressContextQuery({
    asOfDate,
    timezone,
    factsFrom: bounds.factsFrom,
    factsTo: bounds.factsTo,
    subjectUserId: progressSubjectUserId({
      targetIsViewer: false,
      targetSubjectUserId: partnerId,
    }),
  });
}

export function resolveCalendarReadOnlyState(scope: DuoScope) {
  if (scope !== "partner") {
    return {
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    };
  }
  return {
    showViewerSessions: false,
    allowMutations: false,
    banner: "Partner completions (view only)",
  };
}

export function buildPartnerMarkerAccessibilityLabel(goalTitle: string) {
  return `${goalTitle}. Partner marked this done.`;
}

export function buildCalendarMonthMarkerModel({
  markers,
  maxVisible = 2,
}: {
  markers: PlannerCompletionFactMarker[];
  maxVisible?: number;
}) {
  const visible = markers.slice(0, maxVisible);
  return {
    visibleMarkers: visible,
    overflowCount: Math.max(markers.length - visible.length, 0),
  };
}

export function buildCalendarMonthCellAccessibilityLabel({
  day,
  includeViewerSessionClause,
  viewerSessionCount,
  overlayActive,
  partnerMarkers,
  partnerOverflowCount,
}: {
  day: string;
  includeViewerSessionClause: boolean;
  viewerSessionCount: number;
  overlayActive: boolean;
  partnerMarkers: PlannerCompletionFactMarker[];
  partnerOverflowCount: number;
}) {
  const parts = [day];
  if (includeViewerSessionClause) {
    parts.push(
      `${viewerSessionCount} viewer session${viewerSessionCount === 1 ? "" : "s"}`
    );
  }
  if (!overlayActive) {
    return `${parts.join(". ")}.`;
  }
  const partnerNames = partnerMarkers.map((marker) => marker.goalTitle);
  if (partnerNames.length === 0 && partnerOverflowCount === 0) {
    parts.push("No partner completions shown");
    return `${parts.join(". ")}.`;
  }
  const overflowLabel =
    partnerOverflowCount > 0
      ? ` plus ${partnerOverflowCount} more partner completion${
          partnerOverflowCount === 1 ? "" : "s"
        }`
      : "";
  parts.push(`Partner completions: ${partnerNames.join(", ")}${overflowLabel}`);
  return `${parts.join(". ")}.`;
}

export function resolveCalendarOverlayState({
  overlayEnabled,
  partnerId,
  month,
  data,
  loading,
  error,
}: {
  overlayEnabled: boolean;
  partnerId: string | null;
  month: string;
  data: CalendarOverlayPayload | null;
  loading: boolean;
  error: unknown;
}) {
  if (!overlayEnabled || !partnerId || loading) {
    return {
      markersByDate: EMPTY_CALENDAR_MARKERS_BY_DATE,
      error: null,
    };
  }
  const freshData =
    data && data.partnerId === partnerId && data.month === month ? data : null;
  if (!freshData || error) {
    return {
      markersByDate: EMPTY_CALENDAR_MARKERS_BY_DATE,
      error: error ? PARTNER_CALENDAR_UNAVAILABLE_MESSAGE : null,
    };
  }
  return {
    markersByDate: freshData.markersByDate,
    error: null,
  };
}
