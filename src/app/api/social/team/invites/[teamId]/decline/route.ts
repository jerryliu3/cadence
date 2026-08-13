import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";

export const runtime = "nodejs";

type RpcErrorLike = {
  message: string;
};

const paramsSchema = z.object({ teamId: z.uuid() });

function mapDeclineTeamInviteError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (error.message === "team_id_required") {
    return new ApiRouteError(400, "team_id_required", "Team id is required.");
  }
  return new ApiRouteError(500, "team_decline_failed", "Could not decline team invite.", {
    cause: error.message,
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ teamId: string }> | { teamId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const socialContext = await requireSocialRouteContext(request);

    const { data, error } = await socialContext.supabase.rpc("decline_team_invite_service", {
      p_team_id: params.teamId,
    });
    if (error) {
      throw mapDeclineTeamInviteError(error);
    }
    if (!data) {
      throw new ApiRouteError(
        409,
        "team_invite_not_actionable",
        "Team invite is no longer pending or cannot be declined."
      );
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
