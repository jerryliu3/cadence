import { NextResponse } from "next/server";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function toSeasonDto(row: {
  id: string;
  slug: string;
  title: string;
  subject_kind: "user" | "duo";
  metric:
    | "total_xp"
    | "category_xp"
    | "completions_count"
    | "distinct_active_days"
    | "max_streak_days";
  metric_track_key: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "upcoming" | "open" | "closed";
  rollover: "none" | "weekly" | "monthly" | "quarterly";
  closed_at: string | null;
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    rollover: row.rollover,
    closedAt: row.closed_at,
  };
}

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({
      supabase,
      requireLeaderboards: true,
    });

    const { data, error } = await context.supabase.rpc("get_social_leaderboards");
    if (error) {
      throw new RouteError(
        500,
        "social_leaderboards_unavailable",
        "Leaderboards are unavailable.",
        { cause: error.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toSeasonDto),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Leaderboard list request failed unexpectedly.",
    });
  }
}
