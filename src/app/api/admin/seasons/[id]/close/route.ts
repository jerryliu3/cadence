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
    const { error } = await admin
      .from("leaderboard_seasons")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("status", "open");

    if (error) {
      throw new ApiRouteError(500, "admin_season_close_failed", "Could not close season.", {
        cause: error.message,
      });
    }

    await admin.rpc("rollover_leaderboard_seasons_service");

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
