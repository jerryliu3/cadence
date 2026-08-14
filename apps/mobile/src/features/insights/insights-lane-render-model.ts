import type { DuoLaneSubject, DuoScope } from "@cadence/shared/social/duo";

export type InsightsLaneStatus =
  | "loading"
  | "partner_unavailable"
  | "error"
  | "ready";

export interface InsightsLaneHeadingModel {
  label: string;
  readOnly: boolean;
}

export function buildInsightsLaneRenderModel({
  scope,
  lane,
  loading,
  error,
}: {
  scope: DuoScope;
  lane: DuoLaneSubject;
  loading: boolean;
  error: unknown;
}) {
  let status: InsightsLaneStatus = "ready";
  if (loading) {
    status = "loading";
  } else if (error) {
    status = lane.id === "partner" ? "partner_unavailable" : "error";
  }

  return {
    status,
    heading:
      scope === "me"
        ? null
        : ({
            label: lane.label,
            readOnly: lane.readOnly,
          } satisfies InsightsLaneHeadingModel),
  };
}
