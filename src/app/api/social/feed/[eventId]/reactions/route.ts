import { NextResponse } from "next/server";
import { z } from "zod";
import { runAfterResponse } from "@/lib/api/after";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
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
    return new RouteError(404, "feed_event_not_found", "Feed event was not found.");
  }
  if (message === "feed_event_not_visible") {
    return new RouteError(403, "feed_event_not_visible", "Feed event is not visible.");
  }
  return new RouteError(500, "feed_reaction_failed", "Feed reaction request failed.", {
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
    const body = await parseBoundedJsonBody(request, 8 * 1024, reactionSchema);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireFeed: true,
    });

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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Feed reaction request failed unexpectedly.",
    });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> | { eventId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const body = await parseBoundedJsonBody(request, 8 * 1024, reactionSchema);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireFeed: true,
    });

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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Feed reaction delete request failed unexpectedly.",
    });
  }
}
