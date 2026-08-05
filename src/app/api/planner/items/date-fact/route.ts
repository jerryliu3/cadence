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
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const itemDateFactSchema = z.object({
  itemId: z.string().uuid(),
  desiredFactState: z.enum(["present", "absent"]),
  expectedCreditedUnit: z
    .object({
      goalId: z.string().min(1).max(100),
      requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      unitKey: z.string().min(1).max(100),
      completedOn: z.iso.date(),
    })
    .nullable(),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
  expectedItemRevision: z.number().int().nonnegative(),
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
      requiredCapability: "targetedExactCompletion",
      disabledCode: "targeted_exact_completion_disabled",
      disabledMessage: "Exact-date completion APIs are not enabled for this owner.",
    });
    telemetryOwnerId = routeContext.userId;
    telemetryCapabilities = routeContext.capabilities;
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      itemDateFactSchema
    );
    const admin = requirePlannerAdminClient();
    const response = await callAdminRpc(
      admin,
      "set_execution_plan_item_date_fact_service",
      {
        p_owner: routeContext.userId,
        p_item_id: body.itemId,
        p_desired_fact_state: body.desiredFactState,
        p_expected_credited_unit: body.expectedCreditedUnit,
        p_expected_canonical_revision: body.expectedCanonicalRevision,
        p_expected_execution_revision: body.expectedExecutionRevision,
        p_expected_item_revision: body.expectedItemRevision,
      }
    );
    if (response.error) {
      const message = response.error.message.toLowerCase();
      if (
        message.includes("planner revision mismatch") ||
        message.includes("planner item revision mismatch") ||
        message.includes("credited unit mismatch")
      ) {
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
      if (message.includes("item state cannot accept exact-date facts")) {
        throw new PlannerRouteError(
          422,
          "item_date_fact_disallowed",
          "This item state cannot be updated with exact-date completion facts."
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
        "planner_item_date_fact_failed",
        "Planner item date fact could not be updated.",
        { cause: response.error.message }
      );
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner item date fact did not return updated state."
      );
    }

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
      data: { action: "item_date_fact" },
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        itemId: row.item_id as string,
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
          data: { action: "item_date_fact" },
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
        data: { action: "item_date_fact" },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
