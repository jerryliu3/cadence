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
import { toPlannerScheduleWindow } from "@/lib/planner/dates";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const fullResetSchema = z.object({
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  scopeMonths: z
    .array(
      z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .refine((month) => {
          const monthNumber = Number(month.slice(5, 7));
          return monthNumber >= 1 && monthNumber <= 12;
        })
    )
    .min(1)
    .max(36),
});

export async function handlePlannerResetAll(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const routeContext = await requirePlannerRouteContext(request);
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      fullResetSchema
    );

    const windows = body.scopeMonths.map((scopeMonth) =>
      toPlannerScheduleWindow(scopeMonth)
    );

    const resetResponse = await routeContext.supabase.rpc(
      "clear_planner_schedule_windows",
      {
        p_windows: windows as unknown as Json,
        p_expected_digest: body.expectedDigest,
      }
    );

    if (resetResponse.error) {
      if (postgresErrorMatches(resetResponse.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner reset state is stale. Refresh and try again."
        );
      }
      if (
        postgresErrorMatches(
          resetResponse.error,
          "22023",
          "invalid_schedule_windows_payload"
        ) ||
        postgresErrorMatches(
          resetResponse.error,
          "22023",
          "duplicate_schedule_window"
        ) ||
        postgresErrorMatches(
          resetResponse.error,
          "22023",
          "overlapping_schedule_windows"
        ) ||
        postgresErrorMatches(resetResponse.error, "22023", "invalid_schedule_window")
      ) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Provide valid scope months for full reset."
        );
      }
      throw new PlannerRouteError(
        409,
        "planner_reset_failed",
        "Full planner reset could not be completed.",
        { cause: resetResponse.error.message }
      );
    }

    const resetRow = Array.isArray(resetResponse.data)
      ? resetResponse.data[0]
      : resetResponse.data;

    if (!resetRow) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Full planner reset did not return updated state."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        requestedScopeCount: body.scopeMonths.length,
        scopeCount:
          typeof resetRow.window_count === "number" ? resetRow.window_count : 0,
        deletedCount:
          typeof resetRow.deleted_count === "number" ? resetRow.deleted_count : 0,
        scheduleDigest:
          typeof resetRow.schedule_digest === "string"
            ? resetRow.schedule_digest
            : null,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}

export async function POST(request: Request) {
  return handlePlannerResetAll(request);
}
