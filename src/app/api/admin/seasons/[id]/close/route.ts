import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const adminContext = await requireAdminContext("admin");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();

    // Refresh open seasons first so early close freezes current scores.
    const { error: refreshError } = await admin.rpc("refresh_leaderboard_standings_service");
    if (refreshError) {
      throw new ApiRouteError(500, "admin_season_close_failed", "Could not refresh standings before close.", {
        cause: refreshError.message,
      });
    }

    const { data: season, error: seasonError } = await admin
      .from("leaderboard_seasons")
      .select("id, ends_at, status")
      .eq("id", params.id)
      .maybeSingle();
    if (seasonError) {
      throw new ApiRouteError(500, "admin_season_close_failed", "Could not load season.", {
        cause: seasonError.message,
      });
    }
    if (!season) {
      throw new ApiRouteError(404, "season_not_found", "Leaderboard season was not found.");
    }
    if (season.status !== "open") {
      throw new ApiRouteError(409, "season_not_open", "Only open seasons can be closed.");
    }

    const nowIso = new Date().toISOString();
    const endsAt =
      season.ends_at == null || Date.parse(season.ends_at) > Date.parse(nowIso)
        ? nowIso
        : season.ends_at;

    const { data: closed, error } = await admin
      .from("leaderboard_seasons")
      .update({
        status: "closed",
        ends_at: endsAt,
      })
      .eq("id", params.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(500, "admin_season_close_failed", "Could not close season.", {
        cause: error.message,
      });
    }
    if (!closed) {
      throw new ApiRouteError(409, "season_not_open", "Only open seasons can be closed.");
    }

    const { error: rolloverError } = await admin.rpc("rollover_leaderboard_seasons_service");
    if (rolloverError) {
      throw new ApiRouteError(500, "admin_season_close_failed", "Could not rollover after close.", {
        cause: rolloverError.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        closed: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_season_id", "Season id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Admin season close request failed unexpectedly.",
    ), correlationId);
  }
}
