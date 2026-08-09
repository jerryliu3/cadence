import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
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
    const body = await parseBoundedJsonBody(request, 8 * 1024, requestSchema);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireDuo: true,
    });

    const { data, error } = await socialContext.supabase.rpc("accept_duo_invite_service", {
      p_duo_id: params.duoId,
      p_visibility_acknowledged: body.visibilityAcknowledged,
    });
    if (error) {
      throw new RouteError(500, "duo_accept_failed", "Could not accept duo invite.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        accepted: Boolean(data),
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
      message: "Duo accept request failed unexpectedly.",
    });
  }
}
