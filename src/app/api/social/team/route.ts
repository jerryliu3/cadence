import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/api/after";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import { requireSocialRouteContext } from "@/lib/social/api";
import { mapTeamStateError } from "@/lib/social/team";
import { mapTeamStateRpcRow } from "@cadence/shared/social/team";

export const runtime = "nodejs";

type RpcErrorLike = {
  message: string;
};

function mapDissolveTeamError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  return new ApiRouteError(500, "team_dissolve_failed", "Team dissolve failed.", {
    cause: error.message,
  });
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const context = await requireSocialRouteContext(request);

    const { data, error } = await context.supabase.rpc("get_team_state");
    if (error) {
      throw mapTeamStateError(error);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(mapTeamStateRpcRow),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Team state request failed unexpectedly.",
    ), correlationId);
  }
}

export async function DELETE(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const context = await requireSocialRouteContext(request);

    const { data, error } = await context.supabase.rpc("dissolve_team_service");
    if (error) {
      throw mapDissolveTeamError(error);
    }
    if (!data) {
      throw new ApiRouteError(409, "team_not_active", "No active team is available to dissolve.");
    }

    runAfterResponse(() => flushNotificationOutbox({ limit: 20 }));

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        dissolved: Boolean(data),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Team dissolve request failed unexpectedly.",
    ), correlationId);
  }
}
