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

type RpcErrorLike = {
  message: string;
};

const paramsSchema = z.object({ teamId: z.uuid() });
const requestSchema = z.object({
  visibilityAcknowledged: z.boolean(),
});

function mapAcceptTeamInviteError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (error.message === "team_id_required") {
    return new ApiRouteError(400, "team_id_required", "Team id is required.");
  }
  if (error.message === "visibility_ack_required") {
    return new ApiRouteError(
      400,
      "visibility_ack_required",
      "Visibility acknowledgement is required."
    );
  }
  if (error.message === "team_already_active" || error.message === "partner_already_active") {
    return new ApiRouteError(409, error.message, "A team is already active for one of these users.");
  }
  return new ApiRouteError(500, "team_accept_failed", "Could not accept team invite.", {
    cause: error.message,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamId: string }> | { teamId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const body = await parseJsonBody({ request: request, maxBytes: 8 * 1024, schema: requestSchema });
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("accept_team_invite_service", {
      p_team_id: params.teamId,
      p_visibility_acknowledged: body.visibilityAcknowledged,
    });
    if (error) {
      throw mapAcceptTeamInviteError(error);
    }
    if (!data) {
      throw new ApiRouteError(
        409,
        "team_invite_not_actionable",
        "Team invite is no longer pending or cannot be accepted."
      );
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Team accept request failed unexpectedly.",
    ), correlationId);
  }
}
