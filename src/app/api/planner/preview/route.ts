import { NextResponse } from "next/server";
import { z } from "zod";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { goalAssessmentSchema } from "@/lib/planner/assessment";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  ELIGIBILITY_MODE,
  MAX_API_BODY_BYTES,
  MAX_ELIGIBLE_GOALS,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import { PlannerError } from "@/lib/planner/errors";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const previewRequestSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  asOfDate: z.iso.date().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone)
    .optional(),
  policy: z.unknown().optional(),
  assessments: z.array(goalAssessmentSchema).max(MAX_ELIGIBLE_GOALS).optional(),
  source: z.enum(["manual", "ai", "update"]).default("manual"),
});

function plannerKernelErrorToRouteError(error: PlannerError) {
  if (error.httpStatus === 413) {
    return new PlannerRouteError(413, "plan_too_large", error.message, error.details);
  }
  if (error.httpStatus === 400) {
    return new PlannerRouteError(400, "validation_failed", error.message, error.details);
  }
  return new PlannerRouteError(
    error.httpStatus,
    error.code,
    error.message,
    error.details
  );
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerGeneration",
      disabledCode: "planner_generation_disabled",
      disabledMessage:
        "Planner generation APIs are not enabled for this owner.",
    });

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      previewRequestSchema
    );
    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
    });

    const effectiveTimezone =
      body.timezone ?? snapshot.preferences?.timezone;
    if (!effectiveTimezone) {
      throw new PlannerRouteError(
        422,
        "timezone_confirmation_required",
        "Confirm planner timezone before requesting a preview."
      );
    }
    const asOfDate =
      body.asOfDate ?? getDateInTimezone(new Date(), effectiveTimezone);
    const effectivePolicy = body.policy
      ? plannerPolicySchema.parse(body.policy)
      : snapshot.preferences
        ? plannerPolicySchema.parse(snapshot.preferences.default_policy)
        : createDefaultPlannerPolicy(
            effectiveTimezone,
            new Date().toISOString()
          );
    if (effectivePolicy.timezone !== effectiveTimezone) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner policy timezone must match the request timezone."
      );
    }

    const preview = runPlannerKernel({
      schemaVersion: PLANNER_CONTRACT_VERSION,
      eligibilityMode: ELIGIBILITY_MODE,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
      asOfDate,
      timezone: effectiveTimezone,
      goals: snapshot.goals,
      completions: snapshot.completions,
      links: snapshot.links,
      assessments: body.assessments,
      policy: effectivePolicy,
      basePlan: snapshot.activePlan?.basePlan ?? null,
    });

    const responseBody = {
      schemaVersion: "1",
      source: body.source,
      scopeMonth: body.scopeMonth,
      asOfDate,
      timezone: effectiveTimezone,
      revisions: snapshot.revisions,
      baseActivePlan: snapshot.activePlan
        ? {
            planId: snapshot.activePlan.plan.id,
            version: snapshot.activePlan.plan.version,
            generationInputHash: snapshot.activePlan.plan.generation_input_hash,
          }
        : null,
      preview,
      correlationId,
    } as const;
    if (
      Buffer.byteLength(JSON.stringify(responseBody), "utf8") >
      MAX_API_BODY_BYTES
    ) {
      throw new PlannerRouteError(
        413,
        "response_bound_exceeded",
        "Planner preview exceeded the supported response bound."
      );
    }

    return NextResponse.json(responseBody, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PlannerError) {
      return plannerErrorResponse(
        plannerKernelErrorToRouteError(error),
        correlationId
      );
    }
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
