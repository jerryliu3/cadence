import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  withPlannerRoute,
} from "@/lib/planner/api";
import { createDefaultAssessment, goalAssessmentSchema } from "@/lib/planner/assessment";
import { canonicalHash } from "@/lib/planner/canonical";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  MAX_API_BODY_BYTES,
  PLANNER_ELIGIBILITY_MODES,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import { PlannerError, runPlannerKernel } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import {
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import { evaluateActivePlanStaleness } from "@/lib/planner/staleness";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const solveIntentSchema = z.enum(["stable", "replan"]);

const contextQuerySchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }, "Invalid scope month."),
  asOfDate: z.iso.date().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone)
    .optional(),
});

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
  source: z.enum(["manual", "ai", "update"]).default("manual"),
  solveIntent: solveIntentSchema.default("stable"),
});

const upsertPreferencesSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone),
  defaultPolicy: z.unknown().optional(),
});

function toPlannerGoalSemanticSnapshot(goal: {
  title: string;
  category: string;
  color: string | null;
  start_date: string;
  end_date: string | null;
  requirement_fingerprint: string;
  assessment_input_hash: string;
  assessment_snapshot: unknown;
}) {
  return {
    title: goal.title,
    category: goal.category,
    color: goal.color,
    startDate: goal.start_date,
    endDate: goal.end_date,
    requirementFingerprint: goal.requirement_fingerprint,
    assessmentInputHash: goal.assessment_input_hash,
    assessmentFingerprint: canonicalHash(goal.assessment_snapshot),
  };
}

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

type PlannerCanonicalSnapshotResult = Awaited<
  ReturnType<typeof loadPlannerCanonicalSnapshot>
>;

function resolvePlannerPreview({
  ownerId,
  scopeMonth,
  requestedAsOfDate,
  requestedTimezone,
  requestedPolicy,
  snapshot,
  assessments,
  requireExplicitTimezone,
  includeKernel = true,
  solveIntent = "stable",
}: {
  ownerId: string;
  scopeMonth: string;
  requestedAsOfDate?: string;
  requestedTimezone?: string;
  requestedPolicy?: unknown;
  snapshot: PlannerCanonicalSnapshotResult;
  assessments?: ReturnType<typeof goalAssessmentSchema.parse>[];
  requireExplicitTimezone: boolean;
  includeKernel?: boolean;
  solveIntent?: "stable" | "replan";
}) {
  const effectiveTimezone =
    requestedTimezone ??
    snapshot.preferences?.timezone ??
    (requireExplicitTimezone ? null : "UTC");

  if (!effectiveTimezone) {
    throw new PlannerRouteError(
      422,
      "timezone_confirmation_required",
      "Confirm planner timezone before requesting a preview."
    );
  }

  const asOfDate = resolveCanonicalAsOfDate({
    timezone: effectiveTimezone,
    requestedAsOfDate,
  });

  const policySource =
    requestedPolicy ??
    snapshot.preferences?.default_policy ??
    createDefaultPlannerPolicy(effectiveTimezone, new Date().toISOString());
  const parsedPolicy = plannerPolicySchema.safeParse(policySource);
  if (!parsedPolicy.success) {
    throw new PlannerRouteError(
      400,
      "validation_failed",
      "Planner policy failed validation.",
      {
        stage: requestedPolicy ? "request_policy" : "stored_policy",
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

  const preview = includeKernel
    ? runPlannerKernel({
        schemaVersion: PLANNER_CONTRACT_VERSION,
        eligibilityMode: PLANNER_ELIGIBILITY_MODES[0],
        ownerId,
        scopeMonth,
        asOfDate,
        timezone: effectiveTimezone,
        goals: snapshot.goals,
        completions: snapshot.completions,
        links: snapshot.links,
        assessments,
        policy: effectivePolicy,
        basePlan: snapshot.activePlan?.basePlan ?? null,
        solveIntent,
      })
    : null;

  return {
    asOfDate,
    effectiveTimezone,
    effectivePolicy,
    preview,
  };
}

export async function GET(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      disabledStatus: 404,
      disabledCode: "planner_read_disabled",
      disabledMessage: "Planner read APIs are not enabled for this owner.",
    });

    const url = new URL(request.url);
    const parsedQuery = contextQuerySchema.safeParse({
      scopeMonth: url.searchParams.get("scopeMonth") ?? undefined,
      asOfDate: url.searchParams.get("asOfDate") ?? undefined,
      timezone: url.searchParams.get("timezone") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Provide a valid scope month and optional bounded planner context dates."
      );
    }

    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: parsedQuery.data.scopeMonth,
    });

    const activeAssessments = (snapshot.activePlan?.goals ?? []).map((goal) =>
      goalAssessmentSchema.parse(goal.assessment_snapshot)
    );
    const activeAssessmentByGoalId = new Map(
      activeAssessments.map((assessment) => [assessment.goalId, assessment])
    );
    let resolvedPreview: ReturnType<typeof resolvePlannerPreview>;
    try {
      resolvedPreview = resolvePlannerPreview({
        ownerId: routeContext.userId,
        scopeMonth: parsedQuery.data.scopeMonth,
        requestedAsOfDate: parsedQuery.data.asOfDate,
        requestedTimezone: parsedQuery.data.timezone,
        snapshot,
        assessments:
          activeAssessments.length > 0 ? activeAssessments : undefined,
        requireExplicitTimezone: false,
        includeKernel: routeContext.capabilities.calendarEnabled,
        solveIntent: "stable",
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        throw plannerKernelErrorToRouteError(error);
      }
      throw error;
    }
    const { asOfDate, effectiveTimezone, effectivePolicy, preview: kernel } =
      resolvedPreview;

    const currentGoals = Object.fromEntries(
      snapshot.goals.map((goal) => {
        const assessment =
          activeAssessmentByGoalId.get(goal.id) ??
          createDefaultAssessment(goal);
        return [
          goal.id,
          {
            title: goal.title,
            category: goal.category,
            color: goal.color,
            startDate: goal.start_date,
            endDate: goal.end_date,
            requirementFingerprint:
              normalizeGoalRequirement(goal).requirementFingerprint,
            assessmentInputHash: assessment.assessmentInputHash,
            assessmentFingerprint: canonicalHash(assessment),
          },
        ];
      })
    );

    const staleness =
      snapshot.activePlan && kernel
        ? evaluateActivePlanStaleness({
            snapshot: {
              planId: snapshot.activePlan.plan.id,
              status:
                snapshot.activePlan.plan.status === "active"
                  ? "active"
                  : snapshot.activePlan.plan.status === "dismissed"
                    ? "dismissed"
                    : "superseded",
              timezone: snapshot.activePlan.plan.timezone,
              policyFingerprint: canonicalHash(snapshot.activePlan.policy),
              goals: Object.fromEntries(
                snapshot.activePlan.goals.map((goal) => [
                  goal.original_goal_id,
                  toPlannerGoalSemanticSnapshot(goal),
                ])
              ),
            },
            current: {
              timezone: effectiveTimezone,
              policyFingerprint: canonicalHash(effectivePolicy),
              goals: currentGoals,
              linkedGoalIds: Array.from(
                new Set(
                  snapshot.links.flatMap((link) => [
                    link.sourceGoalId,
                    link.targetGoalId,
                  ])
                )
              ),
              workUnits: kernel.workUnits,
              driftFacts: kernel.driftFacts,
              invalidGoalIds: kernel.solver.invalidGoalIds,
              localToday: getDateInTimezone(
                new Date(),
                snapshot.activePlan.plan.timezone
              ),
            },
          })
        : { status: "not_applicable", stale: false, reasons: [] };

    const responsePayload = {
      schemaVersion: "1",
      scopeMonth: parsedQuery.data.scopeMonth,
      asOfDate,
      timezone: effectiveTimezone,
      goalTitles: Object.fromEntries(
        snapshot.goals.map((goal) => [goal.id, goal.title])
      ),
      revisions: snapshot.revisions,
      capabilities: routeContext.capabilities,
      preferences: snapshot.preferences
        ? {
            timezone: snapshot.preferences.timezone,
            policyRevision: snapshot.preferences.policy_revision,
            timezoneConfirmedAt: snapshot.preferences.timezone_confirmed_at,
            defaultPolicy: effectivePolicy,
          }
        : null,
      activePlan: snapshot.activePlan,
      preview: kernel,
      staleness,
      correlationId,
    } as const;

    if (
      Buffer.byteLength(JSON.stringify(responsePayload), "utf8") >
      MAX_API_BODY_BYTES
    ) {
      throw new PlannerRouteError(
        413,
        "response_bound_exceeded",
        "Planner context exceeded the supported response bound."
      );
    }

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
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

    let resolvedPreview: ReturnType<typeof resolvePlannerPreview>;
    try {
      resolvedPreview = resolvePlannerPreview({
        ownerId: routeContext.userId,
        scopeMonth: body.scopeMonth,
        requestedAsOfDate: body.asOfDate,
        requestedTimezone: body.timezone,
        requestedPolicy: body.policy,
        snapshot,
        requireExplicitTimezone: true,
        solveIntent: body.solveIntent,
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        throw plannerKernelErrorToRouteError(error);
      }
      throw error;
    }
    const { asOfDate, effectiveTimezone, preview } = resolvedPreview;

    const responseBody = {
      schemaVersion: "1",
      source: body.source,
      solveIntent: body.solveIntent,
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
  });
}

export async function PUT(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      disabledCode: "planner_generation_disabled",
      disabledMessage:
        "Planner generation APIs are not enabled for this owner.",
    });

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      upsertPreferencesSchema
    );
    const timezoneConfirmedAt = new Date().toISOString();
    const defaultPolicy = body.defaultPolicy
      ? (() => {
          const parsedPolicy = plannerPolicySchema.safeParse(body.defaultPolicy);
          if (!parsedPolicy.success) {
            throw new PlannerRouteError(
              400,
              "validation_failed",
              "Planner default policy failed validation.",
              { issues: parsedPolicy.error.issues }
            );
          }
          return parsedPolicy.data;
        })()
      : createDefaultPlannerPolicy(body.timezone, timezoneConfirmedAt);
    if (defaultPolicy.timezone !== body.timezone) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner preference timezone and policy timezone must match."
      );
    }

    const normalizedWeekStartsOn = normalizeWeekStartsOn(
      defaultPolicy.weekStartsOn
    );
    const admin = requirePlannerAdminClient();
    const normalizedRestWeekdays = Array.from(
      new Set(defaultPolicy.restWeekdays)
    ).sort((left, right) => left - right);
    const updateResponse = await admin
      .from("profiles")
      .update({
        timezone: body.timezone,
        timezone_confirmed_at: timezoneConfirmedAt,
        week_starts_on: normalizedWeekStartsOn,
        rest_weekdays: normalizedRestWeekdays,
        blackout_ranges: defaultPolicy.blackoutRanges,
      })
      .eq("id", routeContext.userId)
      .select(
        "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
      )
      .maybeSingle();
    if (updateResponse.error) {
      throw new PlannerRouteError(
        409,
        "preference_update_failed",
        "Planner preferences could not be updated.",
        { cause: updateResponse.error.message }
      );
    }
    if (!updateResponse.data) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner preference update did not return an updated profile row."
      );
    }
    const parsedProfile = parsePlannerProfilePreferencesRow(updateResponse.data);
    const resolvedPreferences =
      resolvePlannerPreferencesSnapshot({
        profile: parsedProfile,
      }) ?? {
        timezone: body.timezone,
        timezone_confirmed_at: timezoneConfirmedAt,
        policy_revision: 1,
        default_policy: defaultPolicy,
      };

    return NextResponse.json(
      {
        schemaVersion: "1",
        preferences: {
          timezone: resolvedPreferences.timezone,
          timezoneConfirmedAt: resolvedPreferences.timezone_confirmed_at,
          policyRevision: resolvedPreferences.policy_revision,
          defaultPolicy: resolvedPreferences.default_policy,
        },
        revisions: {
          canonicalRevision: 0,
          executionRevision: 0,
        },
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}
