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
import { monthFromDate } from "@/lib/planner/dates";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const moveSchema = z.object({
  itemId: z.string().uuid(),
  date: z.iso.date(),
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
      moveSchema
    );
    const admin = requirePlannerAdminClient();
    const response = await callAdminRpc(admin, "move_execution_plan_item_service", {
      p_owner: routeContext.userId,
      p_item_id: body.itemId,
      p_date: body.date,
      p_expected_item_revision: body.expectedItemRevision,
      p_expected_canonical_revision: body.expectedCanonicalRevision,
      p_expected_execution_revision: body.expectedExecutionRevision,
    });
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
      if (message.includes("completion_exists")) {
        throw new PlannerRouteError(
          409,
          "completion_exists",
          "This goal already has a completion on the destination date."
        );
      }
      if (message.includes("completed or historical items cannot move")) {
        throw new PlannerRouteError(
          422,
          "item_move_disallowed",
          "Completed or historical planner items cannot be moved."
        );
      }
      if (message.includes("active planner item not found")) {
        throw new PlannerRouteError(
          404,
          "planner_item_not_found",
          "Planner item was not found in the active plan."
        );
      }
      if (message.includes("cross_plan_goal_date_conflict")) {
        throw new PlannerRouteError(
          409,
          "cross_plan_conflict",
          "Another active month plan already schedules this goal on the destination date."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_item_move_failed",
        "Planner item move could not be completed.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner item move did not return updated state."
      );
    }
    const scheduledDate =
      typeof row.scheduled_date === "string" ? row.scheduled_date : null;
    if (!scheduledDate || scheduledDate.length < 7) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner item move did not return a valid scheduled date."
      );
    }
    const scopeMonth = monthFromDate(scheduledDate);
    const syncResult = await syncPlannerItemsFromActiveExecutionPlan({
      admin,
      ownerId: routeContext.userId,
      correlationId,
      scopeMonth,
      source: "planner-move",
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
      data: { action: "move" },
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
        scheduledDate: row.scheduled_date as string,
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
          data: { action: "move" },
        });
        if (error.code === "invariant_failed") {
          emitTelemetryEvent({
            eventName: "planner.invariant.failed",
            ownerId: telemetryOwnerId,
            correlationId,
            capabilities: telemetryCapabilities,
            scope: null,
            result: "error",
            statusCode: 500,
            errorCode: error.code,
            durationMs: Date.now() - startedAt,
            data: {
              invariantCode: error.code,
              stage: "mutation",
            },
          });
        }
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
        data: { action: "move" },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
