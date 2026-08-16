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
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTeamStateRpcRow } from "@cadence/shared/social/team";

export const runtime = "nodejs";

type RpcErrorLike = {
  message: string;
};

const XP_LEDGER_PAGE_SIZE = 1_000;

async function readTeamXp({
  acceptedAt,
  userIds,
}: {
  acceptedAt: string;
  userIds: [string, string];
}) {
  const admin = createAdminClient();
  let totalXp = 0;
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from("xp_ledger")
      .select("seq,xp_delta")
      .in("user_id", userIds)
      .eq("track_key", "global")
      .gte("created_at", acceptedAt)
      .order("seq", { ascending: true })
      .range(offset, offset + XP_LEDGER_PAGE_SIZE - 1);

    if (error) {
      throw new ApiRouteError(
        500,
        "team_xp_unavailable",
        "Team XP is unavailable.",
        { cause: error.message }
      );
    }

    const rows = data ?? [];
    totalXp += rows.reduce((sum, row) => sum + row.xp_delta, 0);
    if (rows.length < XP_LEDGER_PAGE_SIZE) {
      return totalXp;
    }
    offset += XP_LEDGER_PAGE_SIZE;
  }
}

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

    const items = (data ?? []).map(mapTeamStateRpcRow);
    const activeTeam = items.find(
      (item) => item.status === "active" && item.acceptedAt
    );
    if (activeTeam?.acceptedAt) {
      activeTeam.teamXp = await readTeamXp({
        acceptedAt: activeTeam.acceptedAt,
        userIds: [context.userId, activeTeam.partnerId],
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items,
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
