import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/api/admin-context";

export const runtime = "nodejs";

const routeParamsSchema = z.object({
  id: z.uuid(),
});

const requestSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

function mapModerationRpcError(message: string) {
  if (message.includes("authentication_required")) {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (message.includes("admin_required")) {
    return new ApiRouteError(403, "admin_required", "Moderator access is required.");
  }
  return new ApiRouteError(
    500,
    "moderation_update_failed",
    "Feed moderation update failed.",
    { cause: message }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = routeParamsSchema.parse(await context.params);
    const adminContext = await requireAdminContext("moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseJsonBody({ request: request, maxBytes: 32 * 1024, schema: requestSchema });
    const { data, error } = await adminContext.supabase.rpc("hide_feed_event_service", {
      p_event_id: params.id,
      p_hidden: body.hidden,
      p_reason: body.reason ?? undefined,
    });

    if (error) {
      throw mapModerationRpcError(error.message);
    }
    if (!data) {
      throw new ApiRouteError(404, "feed_event_not_found", "Feed event was not found.");
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Feed moderation request failed unexpectedly.",
    ), correlationId);
  }
}
