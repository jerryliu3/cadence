import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import { requireSocialRouteContext } from "@/lib/social/api";

export const runtime = "nodejs";

const requestSchema = z.object({
  toUserId: z.uuid(),
  kind: z.enum(["cheer", "remind", "custom"]).default("cheer"),
  goalId: z.uuid().optional(),
  message: z.string().trim().max(140).optional(),
});

function mapNudgeError(message: string) {
  if (message === "team_required") {
    return new ApiRouteError(409, "team_required", "You need an active team to send nudges.");
  }
  if (message === "nudges_not_allowed") {
    return new ApiRouteError(403, "nudges_not_allowed", "Your partner has nudges disabled.");
  }
  if (message === "nudge_rate_limited_24h" || message === "nudge_rate_limited_goal_daily") {
    return new ApiRouteError(429, message, "Nudge rate limit reached for this timeframe.");
  }
  return new ApiRouteError(500, "nudge_send_failed", "Nudge send failed.", { cause: message });
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const body = await parseJsonBody({ request: request, maxBytes: 16 * 1024, schema: requestSchema });
    const socialContext = await requireSocialRouteContext(request);

    const { data, error } = await socialContext.supabase.rpc("send_nudge_service", {
      p_to_user_id: body.toUserId,
      p_kind: body.kind,
      p_goal_id: body.goalId ?? undefined,
      p_message: body.message ?? undefined,
    });
    if (error) {
      throw mapNudgeError(error.message);
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        nudgeId: data,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Nudge request failed unexpectedly.",
    ), correlationId);
  }
}
