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

const createManualItemSchema = z.object({
  goalId: z.string().uuid(),
  scheduledDate: z.iso.date(),
  scheduledTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .nullable()
    .optional(),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      createManualItemSchema
    );
    const response = await routeContext.supabase.rpc("create_planner_manual_item", {
      p_goal_id: body.goalId,
      p_scheduled_date: body.scheduledDate,
      p_scheduled_time: body.scheduledTime ?? null,
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
      if (postgresErrorMatches(response.error, "22023", "unknown_goal")) {
        throw new PlannerRouteError(
          404,
          "planner_goal_not_found",
          "Goal was not found for the current planner owner."
        );
      }
      if (
        postgresErrorMatches(
          response.error,
          "P0001",
          "scheduled_outside_goal_lifetime"
        )
      ) {
        throw new PlannerRouteError(
          422,
          "planner_not_publishable",
          "Manual session date must stay inside the goal lifetime."
        );
      }
      if (postgresErrorMatches(response.error, "22023", "invalid_scheduled_time")) {
        throw new PlannerRouteError(
          422,
          "time_validation_failed",
          "Manual session time must use HH:MM in 24-hour format."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "schedule_conflict")) {
        throw new PlannerRouteError(
          409,
          "schedule_conflict",
          "This goal already has a manual session on that date."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_item_create_failed",
        "Manual planner session could not be created.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Manual planner session did not return created state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
        unitKey: typeof row.unit_key === "string" ? row.unit_key : null,
        scheduledDate:
          typeof row.scheduled_date === "string" ? row.scheduled_date : body.scheduledDate,
        locked: Boolean(row.locked),
        scheduleDigest:
          typeof row.schedule_digest === "string" ? row.schedule_digest : null,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}
