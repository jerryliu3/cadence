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

const paramsSchema = z.object({ teamId: z.uuid() });

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamId: string }> | { teamId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("decline_team_invite_service", {
      p_team_id: params.teamId,
    });
    if (error) {
      throw new ApiRouteError(500, "team_decline_failed", "Could not decline team invite.", {
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
        new ApiRouteError(400, "invalid_team_id", "Team id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Team decline request failed unexpectedly.",
    ), correlationId);
  }
}
