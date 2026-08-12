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

const requestSchema = z.object({
  partnerId: z.uuid(),
  message: z.string().trim().max(400).optional(),
});

function mapCreateTeamInviteError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (error.message === "invalid_partner") {
    return new ApiRouteError(400, "invalid_partner", "Partner id is invalid.");
  }
  if (error.message === "team_already_active" || error.message === "partner_already_active") {
    return new ApiRouteError(409, error.message, "A team is already active for one of these users.");
  }
  if (error.message === "owner_required") {
    return new ApiRouteError(403, "owner_required", "Only the initiating user can perform this action.");
  }
  return new ApiRouteError(500, "team_invite_failed", "Could not create team invite.", {
    cause: error.message,
  });
}

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
      throw mapCreateTeamInviteError(error);
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

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
