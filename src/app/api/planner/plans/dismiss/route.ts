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

const dismissSchema = z.object({
  planId: z.string().uuid(),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerPlanWrites",
      disabledCode: "planner_plan_writes_disabled",
      disabledMessage: "Planner write APIs are not enabled for this owner.",
    });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      dismissSchema
    );
    const admin = requirePlannerAdminClient();
    const response = await callUntypedAdminRpc(
      admin,
      "dismiss_execution_plan_service",
      {
      p_owner: routeContext.userId,
      p_plan_id: body.planId,
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
          "Planner plan state is stale. Refresh and try again."
        );
      }
      if (message.includes("active planner plan not found")) {
        throw new PlannerRouteError(
          404,
          "planner_plan_not_found",
          "Planner plan was not found or is no longer active."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_plan_dismiss_failed",
        "Planner plan could not be dismissed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner dismiss did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        planId: row.plan_id as string,
        status: row.status as string,
        revisions: {
          canonicalRevision: body.expectedCanonicalRevision,
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
