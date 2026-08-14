import { buildProgressContextQuery } from "@cadence/shared/goals/progress-context";
import { progressSubjectUserId } from "@cadence/shared/goals/visible-goals";
import type { PlannerCompletionFactMarker } from "@cadence/shared/planner/context";
import { monthGridFactsBounds } from "@cadence/shared/planner/partner-completion";
import type { DuoScope } from "@cadence/shared/social/duo";

export const EMPTY_CALENDAR_MARKERS_BY_DATE = new Map<
  string,
  PlannerCompletionFactMarker[]
>();

export interface CalendarOverlayPayload {
  partnerId: string;
  month: string;
  markersByDate: Map<string, PlannerCompletionFactMarker[]>;
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
      readOnly: false,
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    };
  }
  return {
    readOnly: true,
    showViewerSessions: false,
    allowMutations: false,
    banner: "Partner completions (read-only)",
  };
}

export function buildPartnerMarkerAccessibilityLabel(goalTitle: string) {
  return `${goalTitle}. Partner marked it done.`;
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
      error: error ? "Partner completions are unavailable." : null,
    };
  }
  return {
    markersByDate: freshData.markersByDate,
    error: null,
  };
}
