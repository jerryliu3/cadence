import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  withPlannerRoute,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";

export const runtime = "nodejs";

const deleteManualItemSchema = z.object({
  itemId: z.string().uuid(),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      deleteManualItemSchema
    );
    const response = await routeContext.supabase.rpc("delete_planner_manual_item", {
      p_item_id: body.itemId,
      p_expected_digest: body.expectedDigest,
    });
    if (response.error) {
      if (postgresErrorMatches(response.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner item state is stale. Refresh and try again."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "planner_item_not_found")) {
        throw new PlannerRouteError(
          404,
          "planner_item_not_found",
          "Planner item was not found in the active plan."
        );
      }
      if (postgresErrorMatches(response.error, "22023", "planner_item_not_manual")) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Only manual planner sessions can be removed from this endpoint."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_item_delete_failed",
        "Manual planner session could not be removed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Manual planner session deletion did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
        scheduleDigest:
          typeof row.schedule_digest === "string" ? row.schedule_digest : null,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}
