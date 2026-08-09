import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  partnerId: z.uuid(),
  message: z.string().trim().max(400).optional(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({
      supabase,
      requireDuo: true,
    });
    const body = await parseBoundedJsonBody(request, 32 * 1024, requestSchema);

    const { data, error } = await context.supabase.rpc("create_duo_invite_service", {
      p_partner_id: body.partnerId,
      p_message: body.message ?? undefined,
    });
    if (error) {
      throw new RouteError(500, "duo_invite_failed", "Could not create duo invite.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        duoId: data,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
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
      message: "Duo invite request failed unexpectedly.",
    });
  }
}
