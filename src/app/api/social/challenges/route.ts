import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function toChallengeDto(row: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "draft" | "scheduled" | "active" | "closed" | "archived";
  subject_kind: "user" | "team";
  metric:
    | "total_xp"
    | "category_xp"
    | "completions_count"
    | "distinct_active_days"
    | "max_streak_days";
  metric_track_key: string | null;
  target_value: number | string;
  starts_at: string;
  ends_at: string;
  reward_xp: number;
  max_participants: number | null;
  participant_count: number;
  viewer_joined: boolean;
  viewer_progress: number | string | null;
  viewer_completed_at: string | null;
  viewer_awarded_at: string | null;
  audience_kind: "global" | "cohort";
  cohort_id: string | null;
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    targetValue: Number(row.target_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rewardXp: row.reward_xp,
    maxParticipants: row.max_participants,
    participantCount: row.participant_count,
    viewerJoined: row.viewer_joined,
    viewerProgress:
      row.viewer_progress === null ? null : Number(row.viewer_progress),
    viewerCompletedAt: row.viewer_completed_at,
    viewerAwardedAt: row.viewer_awarded_at,
    audienceKind: row.audience_kind,
    cohortId: row.cohort_id ?? null,
  };
}

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const { data, error } = await context.supabase.rpc("get_social_challenges");
    if (error) {
      if (error.message === "authentication_required") {
        throw new ApiRouteError(401, "authentication_required", "You must be signed in.");
      }
      throw new ApiRouteError(
        500,
        "social_challenges_unavailable",
        "Challenges are unavailable.",
        { cause: error.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toChallengeDto),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge list request failed unexpectedly.",
    ), correlationId);
  }
}
