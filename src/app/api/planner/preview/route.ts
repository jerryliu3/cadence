import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { goalAssessmentSchema } from "@/lib/planner/assessment";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  MAX_API_BODY_BYTES,
  MAX_ELIGIBLE_GOALS,
  PLANNER_ELIGIBILITY_MODES,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import { PlannerError } from "@/lib/planner/errors";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
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
  const startedAt = Date.now();
  let telemetryOwnerId: string | null = null;
  let telemetryCapabilities:
    | Awaited<ReturnType<typeof requirePlannerRouteContext>>["capabilities"]
    | null = null;
  let telemetryScope: { month: string; timezone: string } | null = null;
  let telemetrySource: "manual" | "ai" | "update" = "manual";
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerGeneration",
      disabledCode: "planner_generation_disabled",
      disabledMessage:
        "Planner generation APIs are not enabled for this owner.",
    });
    telemetryOwnerId = routeContext.userId;
    telemetryCapabilities = routeContext.capabilities;

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      previewRequestSchema
    );
    telemetrySource = body.source;
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
    const asOfDate = resolveCanonicalAsOfDate({
      timezone: effectiveTimezone,
      requestedAsOfDate: body.asOfDate,
    });
    telemetryScope = {
      month: body.scopeMonth,
      timezone: effectiveTimezone,
    };
    const policySource =
      body.policy ??
      snapshot.preferences?.default_policy ??
      createDefaultPlannerPolicy(
        effectiveTimezone,
        new Date().toISOString()
      );
    const parsedPolicy = plannerPolicySchema.safeParse(policySource);
    if (!parsedPolicy.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner policy failed validation.",
        {
          stage: body.policy ? "request_policy" : "stored_policy",
          issues: parsedPolicy.error.issues,
        }
      );
    }
    const effectivePolicy = parsedPolicy.data;
    if (effectivePolicy.timezone !== effectiveTimezone) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner policy timezone must match the request timezone."
      );
    }
    const eligibilityMode = PLANNER_ELIGIBILITY_MODES[0];

    const preview = runPlannerKernel({
      schemaVersion: PLANNER_CONTRACT_VERSION,
      eligibilityMode,
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

    emitTelemetryEvent({
      eventName: "planner.preview.completed",
      ownerId: routeContext.userId,
      correlationId,
      capabilities: routeContext.capabilities,
      scope: telemetryScope,
      result:
        preview.solver.placementStatus === "partial" ? "partial" : "success",
      statusCode: 200,
      errorCode: null,
      durationMs: Date.now() - startedAt,
      counts: {
        eligibleGoals: snapshot.goals.length,
        workUnits: preview.workUnits.length,
        completionFacts: snapshot.completions.length,
        policyRanges: effectivePolicy.datePreferences.length,
        placedUnits: preview.workUnits.filter((unit) => unit.scheduledDate !== null)
          .length,
        shortfallUnits: preview.workUnits.filter((unit) => unit.scheduledDate === null)
          .length,
        outputBytes: Buffer.byteLength(JSON.stringify(responseBody), "utf8"),
      },
      data: {
        source: body.source,
        placementStatus: preview.solver.placementStatus,
        searchStatus: preview.solver.searchStatus,
        capacityStatus: preview.solver.capacityStatus,
        boundsBucket:
          preview.workUnits.length > 3000
            ? "maximum"
            : preview.workUnits.length > 1000
              ? "large"
              : preview.workUnits.length > 300
                ? "medium"
                : "small",
      },
    });

    return NextResponse.json(responseBody, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PlannerError) {
      const routeError = plannerKernelErrorToRouteError(error);
      if (telemetryOwnerId && telemetryCapabilities && telemetryScope) {
        emitTelemetryEvent({
          eventName: "planner.preview.completed",
          ownerId: telemetryOwnerId,
          correlationId,
          capabilities: telemetryCapabilities,
          scope: telemetryScope,
          result: classifyTelemetryResult({
            statusCode: routeError.status,
            errorCode: routeError.code,
          }),
          statusCode: routeError.status,
          errorCode: routeError.code,
          durationMs: Date.now() - startedAt,
          data: {
            source: telemetrySource,
            placementStatus: "partial",
            searchStatus: "maximum_partial",
            capacityStatus: "unverified",
            boundsBucket: "small",
          },
        });
      }
      return plannerErrorResponse(routeError, correlationId);
    }
    if (error instanceof PlannerRouteError) {
      if (telemetryOwnerId && telemetryCapabilities && telemetryScope) {
        emitTelemetryEvent({
          eventName: "planner.preview.completed",
          ownerId: telemetryOwnerId,
          correlationId,
          capabilities: telemetryCapabilities,
          scope: telemetryScope,
          result: classifyTelemetryResult({
            statusCode: error.status,
            errorCode: error.code,
          }),
          statusCode: error.status,
          errorCode: error.code,
          durationMs: Date.now() - startedAt,
          data: {
            source: telemetrySource,
            placementStatus: "partial",
            searchStatus: "maximum_partial",
            capacityStatus: "unverified",
            boundsBucket: "small",
          },
        });
      }
      return plannerErrorResponse(error, correlationId);
    }
    if (telemetryOwnerId && telemetryCapabilities && telemetryScope) {
      emitTelemetryEvent({
        eventName: "planner.preview.completed",
        ownerId: telemetryOwnerId,
        correlationId,
        capabilities: telemetryCapabilities,
        scope: telemetryScope,
        result: "error",
        statusCode: 500,
        errorCode: "internal_error",
        durationMs: Date.now() - startedAt,
        data: {
          source: telemetrySource,
          placementStatus: "partial",
          searchStatus: "maximum_partial",
          capacityStatus: "unverified",
          boundsBucket: "small",
        },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
