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
  scopeMonthFromDate,
  syncPlannerItemsFromActiveExecutionPlan,
} from "@/lib/planner/planner-items-runtime-sync";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const dismissSchema = z.object({
  planId: z.string().uuid(),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let telemetryOwnerId: string | null = null;
  let telemetryCapabilities:
    | Awaited<ReturnType<typeof requirePlannerRouteContext>>["capabilities"]
    | null = null;
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerPlanWrites",
      disabledCode: "planner_plan_writes_disabled",
      disabledMessage: "Planner write APIs are not enabled for this owner.",
    });
    telemetryOwnerId = routeContext.userId;
    telemetryCapabilities = routeContext.capabilities;
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      dismissSchema
    );
    const admin = requirePlannerAdminClient();
    const planScopeLookup = await admin
      .from("execution_plans")
      .select("scope_month")
      .eq("owner_id", routeContext.userId)
      .eq("id", body.planId)
      .maybeSingle();
    if (planScopeLookup.error) {
      throw new PlannerRouteError(
        500,
        "planner_plan_dismiss_failed",
        "Planner plan could not be dismissed.",
        { cause: planScopeLookup.error.message }
      );
    }
    const response = await callAdminRpc(
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
    const scopeMonthDateValue =
      typeof planScopeLookup.data?.scope_month === "string"
        ? planScopeLookup.data.scope_month
        : null;
    if (!scopeMonthDateValue || scopeMonthDateValue.length < 7) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner dismiss did not return a valid scope month."
      );
    }
    const syncResult = await syncPlannerItemsFromActiveExecutionPlan({
      admin,
      ownerId: routeContext.userId,
      scopeMonth: scopeMonthFromDate(scopeMonthDateValue),
    });

    emitTelemetryEvent({
      eventName: "planner.mutation.completed",
      ownerId: routeContext.userId,
      correlationId,
      capabilities: routeContext.capabilities,
      scope: {
        month: new Date().toISOString().slice(0, 7),
        timezone: "UTC",
      },
      result: "success",
      statusCode: 200,
      errorCode: null,
      durationMs: Date.now() - startedAt,
      data: { action: "dismiss" },
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        planId: row.plan_id as string,
        status: row.status as string,
        revisions: {
          canonicalRevision: body.expectedCanonicalRevision,
          executionRevision: row.execution_revision as number,
        },
        scheduleDigest: syncResult.scheduleDigest,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      if (telemetryOwnerId && telemetryCapabilities) {
        emitTelemetryEvent({
          eventName: "planner.mutation.completed",
          ownerId: telemetryOwnerId,
          correlationId,
          capabilities: telemetryCapabilities,
          scope: {
            month: new Date().toISOString().slice(0, 7),
            timezone: "UTC",
          },
          result: classifyTelemetryResult({
            statusCode: error.status,
            errorCode: error.code,
          }),
          statusCode: error.status,
          errorCode: error.code,
          durationMs: Date.now() - startedAt,
          data: { action: "dismiss" },
        });
      }
      return plannerErrorResponse(error, correlationId);
    }
    if (telemetryOwnerId && telemetryCapabilities) {
      emitTelemetryEvent({
        eventName: "planner.mutation.completed",
        ownerId: telemetryOwnerId,
        correlationId,
        capabilities: telemetryCapabilities,
        scope: {
          month: new Date().toISOString().slice(0, 7),
          timezone: "UTC",
        },
        result: "error",
        statusCode: 500,
        errorCode: "internal_error",
        durationMs: Date.now() - startedAt,
        data: { action: "dismiss" },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
