import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { requireAdminContext } from "@/lib/api/admin-context";

export const runtime = "nodejs";

const routeParamsSchema = z.object({
  id: z.uuid(),
});

const requestSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = routeParamsSchema.parse(await context.params);
    const adminContext = await requireAdminContext("moderator");
    if (!adminContext) {
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseBoundedJsonBody(request, 32 * 1024, requestSchema);
    const { data, error } = await adminContext.supabase.rpc("hide_feed_event_service", {
      p_event_id: params.id,
      p_hidden: body.hidden,
      p_reason: body.reason ?? undefined,
    });

    if (error) {
      throw new RouteError(
        500,
        "moderation_update_failed",
        "Feed moderation update failed.",
        { cause: error.message }
      );
    }
    if (!data) {
      throw new RouteError(404, "feed_event_not_found", "Feed event was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        feedEventId: params.id,
        hidden: body.hidden,
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
      message: "Feed moderation request failed unexpectedly.",
    });
  }
}
