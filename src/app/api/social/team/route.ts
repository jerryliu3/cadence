import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/api/after";
import { flushNotificationOutbox } from "@/lib/push/outbox";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RpcErrorLike = {
  message: string;
};

function mapTeamStateError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  return new ApiRouteError(500, "team_state_unavailable", "Team state is unavailable.", {
    cause: error.message,
  });
}

function mapDissolveTeamError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  return new ApiRouteError(500, "team_dissolve_failed", "Team dissolve failed.", {
    cause: error.message,
  });
}

function toTeamDto(row: {
  team_id: string;
  status: "pending" | "active" | "closed";
  partner_id: string;
  partner_username: string | null;
  partner_display_name: string | null;
  partner_avatar_url: string | null;
  invite_message: string | null;
  invited_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  is_incoming: boolean;
}) {
  return {
    teamId: row.team_id,
    status: row.status,
    partnerId: row.partner_id,
    partnerUsername: row.partner_username,
    partnerDisplayName: row.partner_display_name,
    partnerAvatarUrl: row.partner_avatar_url,
    inviteMessage: row.invite_message,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    closedAt: row.closed_at,
    isIncoming: row.is_incoming,
  };
}

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const { data, error } = await context.supabase.rpc("get_team_state");
    if (error) {
      throw mapTeamStateError(error);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toTeamDto),
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

export async function DELETE() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

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
