import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_PLANNER_WINDOW_DAYS,
  MAX_API_BODY_BYTES,
} from "@/lib/planner/contracts/bounds";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  withPlannerRoute,
} from "@/lib/planner/api";
import {
  assertDateWindow,
  countDateWindowDays,
  expandToMonthAlignedWindow,
} from "@/lib/planner/dates";
import { PlannerError } from "@/lib/planner/kernel";
import { preparePlannerSchedule } from "@/lib/planner/prepare";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const prepareRequestSchema = z
  .object({
    scopeMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    visibleStart: z.iso.date(),
    visibleEnd: z.iso.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.visibleEnd < value.visibleStart) {
      context.addIssue({
        code: "custom",
        message: "Visible planner window is invalid.",
        path: ["visibleEnd"],
      });
    } else if (
      countDateWindowDays({
        start: value.visibleStart,
        end: value.visibleEnd,
      }) > MAX_PLANNER_WINDOW_DAYS
    ) {
      context.addIssue({
        code: "custom",
        message: "Visible planner window is too large.",
        path: ["visibleEnd"],
      });
    }
  });

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({ supabase });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 64 * 1024),
      prepareRequestSchema
    );
    try {
      assertDateWindow(
        expandToMonthAlignedWindow({
          start: body.visibleStart,
          end: body.visibleEnd,
        })
      );
    } catch (error) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        error instanceof Error ? error.message : "Invalid planner window."
      );
    }
    let payload: Awaited<ReturnType<typeof preparePlannerSchedule>>;
    try {
      payload = await preparePlannerSchedule({
        supabase: routeContext.supabase,
        ownerId: routeContext.userId,
        capabilities: routeContext.capabilities,
        scopeMonth: body.scopeMonth,
        visibleWindow: {
          start: body.visibleStart,
          end: body.visibleEnd,
        },
        correlationId,
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        throw new PlannerRouteError(
          error.httpStatus,
          error.httpStatus === 413 ? "plan_too_large" : "validation_failed",
          error.message,
          error.details
        );
      }
      throw error;
    }
    if (
      Buffer.byteLength(JSON.stringify(payload), "utf8") >
      MAX_API_BODY_BYTES
    ) {
      throw new PlannerRouteError(
        413,
        "response_bound_exceeded",
        "Planner context exceeded the supported response bound."
      );
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
