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
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({ duoId: z.uuid() });
const requestSchema = z.object({
  visibilityAcknowledged: z.boolean(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ duoId: string }> | { duoId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const body = await parseJsonBody({ request: request, maxBytes: 8 * 1024, schema: requestSchema });
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("accept_duo_invite_service", {
      p_duo_id: params.duoId,
      p_visibility_acknowledged: body.visibilityAcknowledged,
    });
    if (error) {
      throw new ApiRouteError(500, "duo_accept_failed", "Could not accept duo invite.", {
        cause: error.message,
      });
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        accepted: Boolean(data),
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Duo accept request failed unexpectedly.",
    ), correlationId);
  }
}
