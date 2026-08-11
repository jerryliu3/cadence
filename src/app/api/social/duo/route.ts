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

function toDuoDto(row: {
  duo_id: string;
  status: "pending" | "active" | "declined" | "cancelled" | "dissolved" | "expired";
  partner_id: string;
  partner_username: string | null;
  partner_display_name: string | null;
  partner_avatar_url: string | null;
  invite_message: string | null;
  invited_at: string;
  accepted_at: string | null;
  is_incoming: boolean;
}) {
  return {
    duoId: row.duo_id,
    status: row.status,
    partnerId: row.partner_id,
    partnerUsername: row.partner_username,
    partnerDisplayName: row.partner_display_name,
    partnerAvatarUrl: row.partner_avatar_url,
    inviteMessage: row.invite_message,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    isIncoming: row.is_incoming,
  };
}

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const { data, error } = await context.supabase.rpc("get_duo_state");
    if (error) {
      throw new ApiRouteError(500, "duo_state_unavailable", "Duo state is unavailable.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toDuoDto),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Duo state request failed unexpectedly.",
    ), correlationId);
  }
}

export async function DELETE() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const { data, error } = await context.supabase.rpc("dissolve_duo_service");
    if (error) {
      throw new ApiRouteError(500, "duo_dissolve_failed", "Duo dissolve failed.", {
        cause: error.message,
      });
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Duo dissolve request failed unexpectedly.",
    ), correlationId);
  }
}
