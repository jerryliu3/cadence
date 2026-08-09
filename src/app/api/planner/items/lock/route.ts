import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import { createClient } from "@/lib/supabase/server";


const lockSchema = z.object({
  itemId: z.string().uuid(),
  locked: z.boolean(),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      disabledCode: "planner_plan_writes_disabled",
      disabledMessage: "Planner write APIs are not enabled for this owner.",
    });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      lockSchema
    );
    const response = await routeContext.supabase.rpc("set_planner_item_lock", {
      p_item_id: body.itemId,
      p_locked: body.locked,
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
      if (postgresErrorMatches(response.error, "22023", "invalid_lock_state")) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Provide a valid lock state."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_item_lock_failed",
        "Planner item lock change could not be completed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner item lock change did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
        locked: Boolean(row.locked),
        scheduleDigest:
          typeof row.schedule_digest === "string" ? row.schedule_digest : null,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
