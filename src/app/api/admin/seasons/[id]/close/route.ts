import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
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
      throw new RouteError(404, "not_found", "Resource not found.");
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
      throw new RouteError(500, "admin_season_close_failed", "Could not close season.", {
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "invalid_season_id", "Season id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Admin season close request failed unexpectedly.",
    });
  }
}
