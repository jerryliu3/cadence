import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
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
    const context = await requireSocialRouteContext({ supabase });
    const body = await parseJsonBody({ request: request, maxBytes: 32 * 1024, schema: requestSchema });

    const { data, error } = await context.supabase.rpc("create_team_invite_service", {
      p_partner_id: body.partnerId,
      p_message: body.message ?? undefined,
    });
    if (error) {
      throw new ApiRouteError(500, "team_invite_failed", "Could not create team invite.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        teamId: data,
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Team invite request failed unexpectedly.",
    ), correlationId);
  }
}
