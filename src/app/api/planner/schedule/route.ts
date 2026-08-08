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
import {
  scopeMonthDate,
  syncPlannerItemsFromActiveExecutionPlan,
} from "@/lib/planner/planner-items-runtime-sync";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const clearScheduleSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
});

export async function DELETE(request: Request) {
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
      clearScheduleSchema
    );

    const admin = requirePlannerAdminClient();
    const scopeMonthDateValue = scopeMonthDate(body.scopeMonth);
    const activePlanLookup = await admin
      .from("execution_plans")
      .select("id")
      .eq("owner_id", routeContext.userId)
      .eq("scope_month", scopeMonthDateValue)
      .eq("status", "active")
      .maybeSingle();
    if (activePlanLookup.error) {
      throw new PlannerRouteError(
        500,
        "planner_schedule_clear_failed",
        "Planner schedule could not be cleared.",
        { cause: activePlanLookup.error.message }
      );
    }

    let executionRevision = body.expectedExecutionRevision;
    let dismissedPlanId: string | null = null;
    if (activePlanLookup.data?.id) {
      const dismissResponse = await callAdminRpc(
        admin,
        "dismiss_execution_plan_service",
        {
          p_owner: routeContext.userId,
          p_plan_id: activePlanLookup.data.id,
          p_expected_canonical_revision: body.expectedCanonicalRevision,
          p_expected_execution_revision: body.expectedExecutionRevision,
        }
      );
      if (dismissResponse.error) {
        const message = dismissResponse.error.message.toLowerCase();
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
          "planner_schedule_clear_failed",
          "Planner schedule could not be cleared.",
          { cause: dismissResponse.error.message }
        );
      }
      const dismissedRow = Array.isArray(dismissResponse.data)
        ? dismissResponse.data[0]
        : dismissResponse.data;
      if (!dismissedRow) {
        throw new PlannerRouteError(
          500,
          "invariant_failed",
          "Planner schedule clear did not return updated state."
        );
      }
      executionRevision =
        typeof dismissedRow.execution_revision === "number"
          ? dismissedRow.execution_revision
          : executionRevision;
      dismissedPlanId =
        typeof dismissedRow.plan_id === "string" ? dismissedRow.plan_id : null;
    }
    const syncResult = await syncPlannerItemsFromActiveExecutionPlan({
      admin,
      ownerId: routeContext.userId,
      correlationId,
      source: "planner-schedule",
    });
    const scheduleDigest = syncResult.scheduleDigest;

    return NextResponse.json(
      {
        schemaVersion: "1",
        scopeMonth: body.scopeMonth,
        dismissedPlanId,
        revisions: {
          canonicalRevision: body.expectedCanonicalRevision,
          executionRevision,
        },
        scheduleDigest,
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
