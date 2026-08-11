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

const paramsSchema = z.object({ duoId: z.uuid() });

export async function POST(
  _request: Request,
  context: { params: Promise<{ duoId: string }> | { duoId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("decline_duo_invite_service", {
      p_duo_id: params.duoId,
    });
    if (error) {
      throw new ApiRouteError(500, "duo_decline_failed", "Could not decline duo invite.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        declined: Boolean(data),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_duo_id", "Duo id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Duo decline request failed unexpectedly.",
    ), correlationId);
  }
}
