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
  challengeId: z.uuid(),
});

function mapChallengeDetailRpcError(message: string) {
  if (message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (message === "challenge_not_found") {
    return new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
  }
  if (message === "cohort_membership_required") {
    return new ApiRouteError(403, "cohort_membership_required", "Cohort membership is required.");
  }
  return new ApiRouteError(500, "social_challenge_unavailable", "Challenge details are unavailable.", {
    cause: message,
  });
}

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ challengeId: string }> | { challengeId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("get_challenge_detail", {
      p_challenge_id: params.challengeId,
    });
    if (error) {
      throw mapChallengeDetailRpcError(error.message);
    }

    const row = data?.[0];
    if (!row) {
      throw new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toChallengeDto(row),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_challenge_id", "Challenge id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge detail request failed unexpectedly.",
    ), correlationId);
  }
}
