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

const instanceAdjustSchema = z
  .object({
    goalId: z.string().uuid(),
    action: z.enum(["add", "delete"]),
    date: z.iso.date().optional(),
    unitKey: z.string().trim().min(1).max(120).optional(),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((value, ctx) => {
    if (value.action === "add" && !value.date) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "Provide a date when adding a planner instance.",
      });
    }
    if (value.action === "delete" && !value.unitKey) {
      ctx.addIssue({
        code: "custom",
        path: ["unitKey"],
        message: "Provide a unit key when deleting a planner instance.",
      });
    }
  });

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      instanceAdjustSchema
    );

    const response = await routeContext.supabase.rpc(
      "adjust_targeted_planner_instance",
      {
        p_goal_id: body.goalId,
        p_action: body.action,
        // Supabase generated RPC arg types mark nullable params as string.
        p_scheduled_date: (body.date ?? null) as unknown as string,
        p_unit_key: (body.unitKey ?? null) as unknown as string,
        p_expected_digest: body.expectedDigest,
      }
    );

    if (response.error) {
      if (postgresErrorMatches(response.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner state is stale. Refresh and try again."
        );
      }
      if (postgresErrorMatches(response.error, "22023", "unknown_goal")) {
        throw new PlannerRouteError(
          404,
          "goal_not_found",
          "Goal was not found for the current user."
        );
      }
      if (postgresErrorMatches(response.error, "22023", "duplicate_goal_date")) {
        throw new PlannerRouteError(
          409,
          "duplicate_goal_date",
          "That goal already has a planned session on this date."
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
          "validation_failed",
          "Planned date must be inside the goal lifetime."
        );
      }
      if (
        postgresErrorMatches(
          response.error,
          "P0001",
          "unsupported_requirement_kind"
        )
      ) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          "Only targeted goals support manual add/delete in this flow."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "goal_terminal")) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          "Goal is not eligible for manual planner instance updates."
        );
      }
      if (
        postgresErrorMatches(response.error, "P0001", "planner_item_not_found")
      ) {
        throw new PlannerRouteError(
          404,
          "planner_item_not_found",
          "Planner item was not found for this goal."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "planner_item_locked")) {
        throw new PlannerRouteError(
          409,
          "planner_item_locked",
          "Unlock this planner item before deleting it."
        );
      }
      if (
        postgresErrorMatches(response.error, "P0001", "planner_item_credited")
      ) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          "Completed planner items cannot be deleted."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "minimum_target_count")) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          "This goal cannot remove its final targeted session."
        );
      }
      if (postgresErrorMatches(response.error, "P0001", "schedule_conflict")) {
        throw new PlannerRouteError(
          409,
          "schedule_conflict",
          "Planner update conflicted with existing schedule state."
        );
      }
      if (
        postgresErrorMatches(response.error, "22023", "invalid_adjust_action") ||
        postgresErrorMatches(response.error, "22023", "invalid_adjust_date") ||
        postgresErrorMatches(response.error, "22023", "invalid_unit_key")
      ) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Planner instance adjust request was invalid."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_instance_adjust_failed",
        "Planner instance update could not be completed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner instance update did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalId: row.goal_id as string,
        unitKey: row.unit_key as string,
        targetCount: Number(row.target_count ?? 0),
        scheduleDigest:
          typeof row.schedule_digest === "string" ? row.schedule_digest : null,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}
