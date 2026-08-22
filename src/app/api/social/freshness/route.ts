import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SOCIAL_REFRESH_INTERVAL_MS = 60 * 1000;

function nextExpectedRefreshAtIso(serverNow: Date) {
  const nowMs = serverNow.getTime();
  const nextRunMs =
    Math.floor(nowMs / SOCIAL_REFRESH_INTERVAL_MS) * SOCIAL_REFRESH_INTERVAL_MS +
    SOCIAL_REFRESH_INTERVAL_MS;
  return new Date(nextRunMs).toISOString();
}

function newestTimestamp(timestamps: Array<string | null | undefined>) {
  const parsedTimestamps = timestamps.flatMap((timestamp) => {
    if (!timestamp) {
      return [];
    }
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
  if (parsedTimestamps.length === 0) {
    return null;
  }
  return new Date(Math.max(...parsedTimestamps)).toISOString();
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    await requireSocialRouteContext(request);
    const admin = createAdminClient();

    const [
      { data: leaderboardRows, error: leaderboardError },
      { data: challengeRows, error: challengeError },
      { data: participantRows, error: participantError },
    ] = await Promise.all([
      admin
        .from("leaderboard_standings")
        .select("refreshed_at")
        .order("refreshed_at", { ascending: false })
        .limit(1),
      admin
        .from("challenges")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
      admin
        .from("challenge_participants")
        .select("progress_at")
        .not("progress_at", "is", null)
        .order("progress_at", { ascending: false })
        .limit(1),
    ]);

    if (leaderboardError) {
      throw new ApiRouteError(
        500,
        "social_freshness_unavailable",
        "Social freshness is unavailable.",
        { cause: leaderboardError.message }
      );
    }
    if (challengeError) {
      throw new ApiRouteError(
        500,
        "social_freshness_unavailable",
        "Social freshness is unavailable.",
        { cause: challengeError.message }
      );
    }
    if (participantError) {
      throw new ApiRouteError(
        500,
        "social_freshness_unavailable",
        "Social freshness is unavailable.",
        { cause: participantError.message }
      );
    }

    const serverNow = new Date();
    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        freshness: {
          serverNow: serverNow.toISOString(),
          nextExpectedRefreshAt: nextExpectedRefreshAtIso(serverNow),
          leaderboardRefreshedAt: leaderboardRows?.[0]?.refreshed_at ?? null,
          challengesRefreshedAt: newestTimestamp([
            challengeRows?.[0]?.updated_at,
            participantRows?.[0]?.progress_at,
          ]),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(
      new ApiRouteError(
        500,
        "internal_error",
        "Social freshness request failed unexpectedly."
      ),
      correlationId
    );
  }
}
