import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import { flushNotificationOutbox, flushNotificationsForUser } from "@/lib/push/outbox";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  eventId: z.uuid(),
});

const reactionSchema = z.object({
  reaction: z.enum(["cheer", "fire", "clap", "strong"]),
  actorId: z.uuid().optional(),
});

function mapReactionError(message: string) {
  if (message === "feed_event_not_found") {
    return new ApiRouteError(404, "feed_event_not_found", "Feed event was not found.");
  }
  if (message === "feed_event_not_visible") {
    return new ApiRouteError(403, "feed_event_not_visible", "Feed event is not visible.");
  }
  return new ApiRouteError(500, "feed_reaction_failed", "Feed reaction request failed.", {
    cause: message,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> | { eventId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const body = await parseJsonBody({ request: request, maxBytes: 8 * 1024, schema: reactionSchema });
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { error } = await socialContext.supabase.rpc("add_feed_reaction_service", {
      p_feed_event_id: params.eventId,
      p_reaction: body.reaction,
    });
    if (error) {
      throw mapReactionError(error.message);
    }

    runAfterResponse(() =>
      body.actorId ? flushNotificationsForUser(body.actorId) : flushNotificationOutbox({ limit: 20 })
    );

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        eventId: params.eventId,
        reaction: body.reaction,
      },
      { headers: { "Cache-Control": "no-store" } }
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Feed reaction request failed unexpectedly.",
    ), correlationId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> | { eventId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const body = await parseJsonBody({ request: request, maxBytes: 8 * 1024, schema: reactionSchema });
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { error } = await socialContext.supabase.rpc("remove_feed_reaction_service", {
      p_feed_event_id: params.eventId,
      p_reaction: body.reaction,
    });
    if (error) {
      throw mapReactionError(error.message);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        eventId: params.eventId,
        reaction: body.reaction,
      },
      { headers: { "Cache-Control": "no-store" } }
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Feed reaction delete request failed unexpectedly.",
    ), correlationId);
  }
}
