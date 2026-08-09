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
import { toScopeMonthDate } from "@/lib/planner/scope-month";
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
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function handlePlannerReset(request: Request) {
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
      clearScheduleSchema
    );

    const clearResponse = await routeContext.supabase.rpc("clear_planner_schedule", {
      p_month: toScopeMonthDate(body.scopeMonth),
      p_expected_digest: body.expectedDigest,
    });
    if (clearResponse.error) {
      if (postgresErrorMatches(clearResponse.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner plan state is stale. Refresh and try again."
        );
      }
      if (postgresErrorMatches(clearResponse.error, "22023", "invalid_scope_month")) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Provide a valid scope month for planner reset."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_reset_failed",
        "Planner month could not be reset.",
        { cause: clearResponse.error.message }
      );
    }

    const clearedRow = Array.isArray(clearResponse.data)
      ? clearResponse.data[0]
      : clearResponse.data;
    if (!clearedRow) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner reset did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        scopeMonth: body.scopeMonth,
        unlockedCount:
          typeof clearedRow.unlocked_count === "number" ? clearedRow.unlocked_count : 0,
        scheduleDigest:
          typeof clearedRow.schedule_digest === "string"
            ? clearedRow.schedule_digest
            : null,
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

export async function POST(request: Request) {
  return handlePlannerReset(request);
}
