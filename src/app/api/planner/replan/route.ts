import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  withPlannerRoute,
} from "@/lib/planner/api";
import { createDefaultAssessment, goalAssessmentSchema } from "@/lib/planner/assessment";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import { MAX_API_BODY_BYTES, PLANNER_ELIGIBILITY_MODES } from "@/lib/planner/contracts/bounds";
import {
  buildDraftPinnedDatesFromCommands,
  plannerDraftCommandSchema,
} from "@/lib/planner/draft-commands";
import { PlannerError, runPlannerKernel } from "@/lib/planner/kernel";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
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
    .optional(),
  policy: z.unknown().optional(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  preserveExistingAssignments: z.boolean().default(false),
  draftCommands: z.array(plannerDraftCommandSchema).max(4000).default([]),
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

function buildMoveDiff({
  stableWorkUnits,
  replanWorkUnits,
}: {
  stableWorkUnits: Array<{
    originalGoalId: string;
    unitKey: string;
    scheduledDate: string | null;
  }>;
  replanWorkUnits: Array<{
    originalGoalId: string;
    unitKey: string;
    scheduledDate: string | null;
  }>;
}) {
  const stableByKey = new Map(
    stableWorkUnits.map((unit) => [
      `${unit.originalGoalId}:${unit.unitKey}`,
      unit.scheduledDate,
    ])
  );
  return replanWorkUnits
    .map((unit) => {
      const key = `${unit.originalGoalId}:${unit.unitKey}`;
      const fromDate = stableByKey.get(key) ?? null;
      const toDate = unit.scheduledDate;
      if (fromDate === toDate) {
        return null;
      }
      return {
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        fromDate,
        toDate,
      };
    })
    .filter(
      (
        value
      ): value is {
        goalId: string;
        unitKey: string;
        fromDate: string | null;
        toDate: string | null;
      } => value !== null
    );
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
      requestSchema
    );

    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
    });

    if (!snapshot.preferences) {
      throw new PlannerRouteError(
        422,
        "timezone_confirmation_required",
        "Confirm planner timezone before requesting a replan proposal."
      );
    }

    const effectiveTimezone = body.timezone ?? snapshot.preferences.timezone;
    const asOfDate = resolveCanonicalAsOfDate({
      timezone: effectiveTimezone,
      requestedAsOfDate: body.asOfDate,
    });
    const policySource =
      body.policy ??
      snapshot.preferences.default_policy ??
      createDefaultPlannerPolicy(effectiveTimezone, new Date().toISOString());
    const parsedPolicy = plannerPolicySchema.safeParse(policySource);
    if (!parsedPolicy.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner policy failed validation.",
        { issues: parsedPolicy.error.issues }
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

    const activeAssessments = (snapshot.activePlan?.goals ?? []).map((goal) =>
      goalAssessmentSchema.parse(goal.assessment_snapshot)
    );
    const assessmentByGoalId = new Map(
      activeAssessments.map((assessment) => [assessment.goalId, assessment])
    );
    const assessments = snapshot.goals.map((goal) =>
      assessmentByGoalId.get(goal.id) ?? createDefaultAssessment(goal)
    );
    const draftPinnedDates = buildDraftPinnedDatesFromCommands(body.draftCommands ?? []);

    const baseKernelInput = {
      schemaVersion: "1" as const,
      eligibilityMode: PLANNER_ELIGIBILITY_MODES[0],
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
      asOfDate,
      timezone: effectiveTimezone,
      goals: snapshot.goals,
      completions: snapshot.completions,
      links: snapshot.links,
      assessments,
      policy: effectivePolicy,
      basePlan: snapshot.activePlan?.basePlan ?? null,
    };

    let stableKernel: ReturnType<typeof runPlannerKernel>;
    let replanKernel: ReturnType<typeof runPlannerKernel>;
    try {
      stableKernel = runPlannerKernel({
        ...baseKernelInput,
        solveIntent: "stable",
        preserveExistingAssignments: body.preserveExistingAssignments,
        draftPinnedDates,
      });
      replanKernel = runPlannerKernel({
        ...baseKernelInput,
        solveIntent: "replan",
        preserveExistingAssignments: body.preserveExistingAssignments,
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        throw plannerKernelErrorToRouteError(error);
      }
      throw error;
    }

    const moves = buildMoveDiff({
      stableWorkUnits: stableKernel.workUnits,
      replanWorkUnits: replanKernel.workUnits,
    });
    if (stableKernel.generationInputHash !== body.previewHash) {
      throw new PlannerRouteError(
        409,
        "preview_hash_mismatch",
        "Planner preview hash is stale. Regenerate and request replan again."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        scopeMonth: body.scopeMonth,
        asOfDate,
        timezone: effectiveTimezone,
        proposal: {
          moveCount: moves.length,
          moves,
        },
        stable: {
          generationInputHash: stableKernel.generationInputHash,
          issueCodes: stableKernel.solver.issueCodes,
          publishable: stableKernel.solver.publishable,
        },
        replan: {
          generationInputHash: replanKernel.generationInputHash,
          issueCodes: replanKernel.solver.issueCodes,
          publishable: replanKernel.solver.publishable,
        },
        correlationId,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  });
}
