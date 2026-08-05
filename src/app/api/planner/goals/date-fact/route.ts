import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { callUntypedAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const planGoalDateFactSchema = z.object({
  planGoalId: z.string().uuid(),
  date: z.iso.date(),
  desiredFactState: z.enum(["present", "absent"]),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "targetedExactCompletion",
      disabledCode: "targeted_exact_completion_disabled",
      disabledMessage: "Exact-date completion APIs are not enabled for this owner.",
    });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      planGoalDateFactSchema
    );
    const admin = requirePlannerAdminClient();
    const response = await callUntypedAdminRpc(
      admin,
      "set_execution_plan_goal_date_fact_service",
      {
        p_owner: routeContext.userId,
        p_plan_goal_id: body.planGoalId,
        p_date: body.date,
        p_desired_fact_state: body.desiredFactState,
        p_expected_canonical_revision: body.expectedCanonicalRevision,
        p_expected_execution_revision: body.expectedExecutionRevision,
      }
    );
    if (response.error) {
      const message = response.error.message.toLowerCase();
      if (message.includes("planner revision mismatch")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner completion state is stale. Refresh and try again."
        );
      }
      if (message.includes("future_completion_not_allowed")) {
        throw new PlannerRouteError(
          422,
          "future_completion_not_allowed",
          "Completions can only be added for today or a past date."
        );
      }
      if (message.includes("completion_outside_goal_lifetime")) {
        throw new PlannerRouteError(
          422,
          "completion_outside_goal_lifetime",
          "The completion date must be within the goal lifetime."
        );
      }
      if (message.includes("linked goals cannot use planner plan-goal date facts")) {
        throw new PlannerRouteError(
          422,
          "linked_goal_disallowed",
          "Linked goals cannot be completed through plan-goal date facts."
        );
      }
      if (message.includes("active planner goal not found")) {
        throw new PlannerRouteError(
          404,
          "planner_goal_not_found",
          "Planner goal was not found in the active plan."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_goal_date_fact_failed",
        "Planner goal date fact could not be updated.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner goal date fact did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        goalId: row.goal_id as string,
        date: row.date as string,
        factState: row.fact_state as "present" | "absent",
        revisions: {
          canonicalRevision: row.canonical_revision as number,
          executionRevision: row.execution_revision as number,
        },
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
