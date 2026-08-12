import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  seasonId: z.uuid(),
});

function toSeasonDto(row: {
  id: string;
  slug: string;
  title: string;
  subject_kind: "user" | "team";
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
  rollover: "none" | "weekly" | "monthly" | "quarterly" | "yearly";
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
  };
}

function toStandingDto(row: {
  season_id: string;
  subject_kind: "user" | "team";
  subject_id: string;
  display_name: string;
  score: number | string;
  rank: number;
  tie_break_at: string | null;
  viewer_rank: number | null;
}) {
  return {
    seasonId: row.season_id,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    displayName: row.display_name,
    score: Number(row.score),
    rank: row.rank,
    tieBreakAt: row.tie_break_at,
    viewerRank: row.viewer_rank,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ seasonId: string }> | { seasonId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const [{ data: seasonRows, error: seasonError }, { data: standingRows, error: standingsError }] =
      await Promise.all([
        socialContext.supabase.rpc("get_social_leaderboard_season", {
          p_season_id: params.seasonId,
        }),
        socialContext.supabase.rpc("get_leaderboard_standings", {
          p_season_id: params.seasonId,
          p_limit: Number.isFinite(limit) ? limit : 50,
          p_offset: Number.isFinite(offset) ? offset : 0,
        }),
      ]);

    if (seasonError) {
      throw new ApiRouteError(500, "social_leaderboards_unavailable", "Leaderboards are unavailable.", {
        cause: seasonError.message,
      });
    }
    if (standingsError) {
      const code = standingsError.message.includes("season_not_found")
        ? "season_not_found"
        : "leaderboard_standings_unavailable";
      throw new ApiRouteError(
        code === "season_not_found" ? 404 : 500,
        code,
        code === "season_not_found"
          ? "Leaderboard season was not found."
          : "Leaderboard standings are unavailable.",
        { cause: standingsError.message }
      );
    }

    const season = (seasonRows ?? [])[0];
    if (!season) {
      throw new ApiRouteError(404, "season_not_found", "Leaderboard season was not found.");
    }

    const standings = (standingRows ?? []).map(toStandingDto);
    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        season: toSeasonDto(season),
        standings,
        viewerRank: standings[0]?.viewerRank ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_season_id", "Season id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Leaderboard standings request failed unexpectedly.",
    ), correlationId);
  }
}
