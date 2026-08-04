import { NextResponse } from "next/server";
import { z } from "zod";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
  createCorrelationId,
} from "@/lib/planner/api";
import { createDefaultAssessment, goalAssessmentSchema } from "@/lib/planner/assessment";
import { canonicalHash } from "@/lib/planner/canonical";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  ELIGIBILITY_MODE,
  MAX_API_BODY_BYTES,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import { evaluateActivePlanStaleness } from "@/lib/planner/staleness";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
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

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerRead",
      disabledStatus: 404,
      disabledCode: "planner_read_disabled",
      disabledMessage: "Planner read APIs are not enabled for this owner.",
    });

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
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

    const effectiveTimezone =
      snapshot.preferences?.timezone ??
      parsedQuery.data.timezone ??
      "UTC";
    const effectivePolicy = snapshot.preferences
      ? plannerPolicySchema.parse(snapshot.preferences.default_policy)
      : createDefaultPlannerPolicy(
          effectiveTimezone,
          new Date().toISOString()
        );
    const asOfDate =
      parsedQuery.data.asOfDate ??
      getDateInTimezone(new Date(), effectiveTimezone);
    const activeAssessments = (snapshot.activePlan?.goals ?? []).map((goal) =>
      goalAssessmentSchema.parse(goal.assessment_snapshot)
    );
    const activeAssessmentByGoalId = new Map(
      activeAssessments.map((assessment) => [assessment.goalId, assessment])
    );
    const kernel = routeContext.capabilities.plannerGeneration
      ? runPlannerKernel({
          schemaVersion: PLANNER_CONTRACT_VERSION,
          eligibilityMode: ELIGIBILITY_MODE,
          ownerId: routeContext.userId,
          scopeMonth: parsedQuery.data.scopeMonth,
          asOfDate,
          timezone: effectiveTimezone,
          goals: snapshot.goals,
          completions: snapshot.completions,
          links: snapshot.links,
          assessments:
            activeAssessments.length > 0 ? activeAssessments : undefined,
          policy: effectivePolicy,
          basePlan: snapshot.activePlan?.basePlan ?? null,
        })
      : null;

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

    const staleness = snapshot.activePlan && kernel
      ? evaluateActivePlanStaleness({
          snapshot: {
            planId: snapshot.activePlan.plan.id,
            status:
              snapshot.activePlan.plan.status === "active"
                ? "active"
                : snapshot.activePlan.plan.status === "dismissed"
                  ? "dismissed"
                  : "superseded",
            eligibilityMode: "end_month_v1",
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
            eligibilityMode: "end_month_v1",
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
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
