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
  syncPlannerItemsFromActiveExecutionPlan,
} from "@/lib/planner/planner-items-runtime-sync";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const lockSchema = z.object({
  itemId: z.string().uuid(),
  locked: z.boolean(),
  expectedItemRevision: z.number().int().nonnegative(),
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
      lockSchema
    );
    const admin = requirePlannerAdminClient();
    const response = await callAdminRpc(
      admin,
      "set_execution_plan_item_lock_service",
      {
        p_owner: routeContext.userId,
        p_item_id: body.itemId,
        p_locked: body.locked,
        p_expected_item_revision: body.expectedItemRevision,
        p_expected_canonical_revision: body.expectedCanonicalRevision,
        p_expected_execution_revision: body.expectedExecutionRevision,
      }
    );
    if (response.error) {
      const message = response.error.message.toLowerCase();
      if (
        message.includes("planner revision mismatch") ||
        message.includes("planner item revision mismatch")
      ) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner item state is stale. Refresh and try again."
        );
      }
      if (message.includes("active planner item not found")) {
        throw new PlannerRouteError(
          404,
          "planner_item_not_found",
          "Planner item was not found in the active plan."
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
    const syncResult = await syncPlannerItemsFromActiveExecutionPlan({
      admin,
      ownerId: routeContext.userId,
      correlationId,
      source: "planner-lock",
    });
    const scheduleDigest = syncResult.scheduleDigest;

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
      data: { action: body.locked ? "lock" : "unlock" },
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
        scheduledDate: (row.scheduled_date as string | null) ?? null,
        locked: Boolean(row.locked),
        itemRevision: row.item_revision as number,
        revisions: {
          canonicalRevision: body.expectedCanonicalRevision,
          executionRevision: row.execution_revision as number,
        },
        scheduleDigest,
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
          data: { action: "lock" },
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
        data: { action: "lock" },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
