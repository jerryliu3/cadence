import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { decodeSocialFeedCursor, encodeSocialFeedCursor } from "@/lib/social/feed/cursor";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "global";
    const actorId = url.searchParams.get("actorId");
    const scopeId = url.searchParams.get("scopeId");
    const cursor = url.searchParams.get("cursor");
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "30", 10);

    let beforeAt: string | null = null;
    let beforeId: string | null = null;
    if (cursor) {
      const decoded = decodeSocialFeedCursor(cursor);
      beforeAt = decoded.createdAt;
      beforeId = decoded.id;
    }

    const { data, error } = await context.supabase.rpc("get_social_feed", {
      p_scope: scope,
      p_scope_id: (scopeId ?? actorId) ?? undefined,
      p_before_at: beforeAt ?? undefined,
      p_before_id: beforeId ?? undefined,
      p_limit: Number.isFinite(limit) ? limit : 30,
    });
    if (error) {
      throw new ApiRouteError(
        500,
        "social_feed_unavailable",
        "Social feed is unavailable.",
        { cause: error.message }
      );
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      createdAt: row.created_at,
      actor: {
        id: row.actor_id,
        username: row.actor_username,
        displayName: row.actor_display_name,
        avatarUrl: row.actor_avatar_url,
      },
      trackKey: row.track_key,
      categoryLabel: row.category_label,
      goalTitle: row.goal_title,
      xpDelta: row.xp_delta,
      occurrenceCount: row.occurrence_count,
      reactionCount: row.reaction_count,
      viewerReacted: row.viewer_reacted,
      payload: row.payload,
    }));

    const last = data && data.length > 0 ? data[data.length - 1] : null;
    const nextCursor =
      last && data && data.length >= Math.min(Math.max(limit || 30, 1), 50)
        ? encodeSocialFeedCursor({
            createdAt: last.created_at,
            id: last.id,
          })
        : null;

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        viewerId: context.userId,
        items,
        nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof Error && error.message === "Malformed social feed cursor.") {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_cursor", "Feed cursor is malformed."),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Social feed request failed unexpectedly.",
    ), correlationId);
  }
}
