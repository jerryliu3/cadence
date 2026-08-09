import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { createDefaultAssessment, goalAssessmentSchema } from "@/lib/planner/assessment";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  MAX_API_BODY_BYTES,
  PLANNER_ELIGIBILITY_MODES,
} from "@/lib/planner/contracts/bounds";
import { PlannerError, runPlannerKernel } from "@/lib/planner/kernel";
import {
  buildPlannerConfirmationHash,
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
} from "@/lib/planner/publish-payload";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import {
  plannerDraftCommandSchema,
} from "@/lib/planner/draft-commands";
import { toScopeMonthDate } from "@/lib/planner/scope-month";
import { plannerPolicySchema } from "@/lib/planner/policy";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";


const publishSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmationHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  policy: z.unknown().optional(),
  eligibilityMode: z.enum(PLANNER_ELIGIBILITY_MODES).optional(),
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

export async function handlePlannerSave(request: Request) {
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
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      publishSchema
    );
    const requestedPolicy = body.policy
      ? (() => {
          const parsed = plannerPolicySchema.safeParse(body.policy);
          if (!parsed.success) {
            throw new PlannerRouteError(
              400,
              "validation_failed",
              "Policy override failed validation.",
              { issues: parsed.error.issues }
            );
          }
          return parsed.data;
        })()
      : null;
    const draftCommands = body.draftCommands;
    const effectiveEligibilityMode =
      body.eligibilityMode ?? PLANNER_ELIGIBILITY_MODES[0];

    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
    });

    if (!snapshot.preferences) {
      throw new PlannerRouteError(
        422,
        "timezone_confirmation_required",
        "Confirm planner timezone before publishing a plan."
      );
    }

    const effectivePolicy =
      requestedPolicy ??
      plannerPolicySchema.parse(snapshot.preferences.default_policy);
    const asOfDate = resolveCanonicalAsOfDate({
      timezone: snapshot.preferences.timezone,
    });
    if (body.scopeMonth < asOfDate.slice(0, 7)) {
      throw new PlannerRouteError(
        422,
        "elapsed_scope_month_publish_forbidden",
        "Publishing an elapsed month is not supported. Publish the current or a future month."
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
    const kernel = runPlannerKernel({
      schemaVersion: "1",
      eligibilityMode: effectiveEligibilityMode,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
      asOfDate,
      timezone: snapshot.preferences.timezone,
      goals: snapshot.goals,
      completions: snapshot.completions,
      links: snapshot.links,
      assessments,
      policy: effectivePolicy,
      basePlan: snapshot.activePlan?.basePlan ?? null,
    });

    if (kernel.generationInputHash !== body.previewHash) {
      throw new PlannerRouteError(
        409,
        "preview_hash_mismatch",
        "Planner preview hash is stale. Regenerate and publish again."
      );
    }

    if (kernel.solver.confirmationRequired) {
      const expectedConfirmationHash = buildPlannerConfirmationHash({
        previewHash: body.previewHash,
        issueCodes: kernel.solver.issueCodes,
      });
      if (body.confirmationHash !== expectedConfirmationHash) {
        throw new PlannerRouteError(
          422,
          "planner_confirmation_required",
          "Publish requires explicit confirmation for a partial or constrained plan.",
          {
            expectedConfirmationHash,
            issueCodes: kernel.solver.issueCodes,
          }
        );
      }
    }
    if (!kernel.solver.publishable) {
      const blockedByInvalidLock = kernel.solver.issueCodes.includes("invalid_lock");
      throw new PlannerRouteError(
        422,
        "planner_not_publishable",
        blockedByInvalidLock
          ? "Publish is blocked because one or more locked planner items conflict with this preview. Unlock the affected sessions and regenerate."
          : "Publish is blocked because this preview is not currently publishable.",
        {
          issueCodes: kernel.solver.issueCodes,
          searchStatus: kernel.solver.searchStatus,
          invalidGoalIds: kernel.solver.invalidGoalIds,
          confirmationRequired: kernel.solver.confirmationRequired,
        }
      );
    }

    let persistence: ReturnType<typeof buildPlannerPublishPersistencePayload>;
    try {
      persistence = buildPlannerPublishPersistencePayload({
        scopeMonth: body.scopeMonth,
        policy: effectivePolicy,
        kernel,
        snapshot,
        draftCommands,
      });
    } catch (error) {
      if (error instanceof PlannerDraftEditValidationError) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          error.message,
          {
            stage: "draft_edits",
            code: error.code,
            ...error.details,
          }
        );
      }
      throw error;
    }
    const scheduledItems = persistence.items
      .filter((item) => item.scheduled_date !== null)
      .map((item) => ({
        goal_id: item.goal_id,
        unit_key: item.unit_key,
        scheduled_date: item.scheduled_date,
        original_scheduled_date: item.original_scheduled_date ?? item.scheduled_date,
        scheduled_time:
          item.scheduled_time_override ?? item.effective_scheduled_local_time ?? null,
        locked: item.locked,
      }));
    const publishResponse = await routeContext.supabase.rpc("set_planner_schedule", {
      p_month: toScopeMonthDate(body.scopeMonth),
      p_items: scheduledItems as unknown as Json,
      p_expected_digest: body.expectedDigest,
    });
    if (publishResponse.error) {
      if (postgresErrorMatches(publishResponse.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner publish state is stale. Refresh and try again."
        );
      }
      if (
        postgresErrorMatches(
          publishResponse.error,
          "22023",
          "invalid_scheduled_time"
        )
      ) {
        throw new PlannerRouteError(
          422,
          "time_validation_failed",
          "Publish is blocked because one or more proposed session times are invalid."
        );
      }
      if (
        postgresErrorMatches(
          publishResponse.error,
          "P0001",
          "scheduled_outside_goal_lifetime"
        )
      ) {
        throw new PlannerRouteError(
          422,
          "planner_not_publishable",
          "Publish is blocked because one or more sessions fall outside goal lifetime."
        );
      }
      if (
        postgresErrorMatches(publishResponse.error, "P0001", "exceeds_target_count")
      ) {
        throw new PlannerRouteError(
          409,
          "exceeds_target_count",
          "This goal already has all of its planned sessions scheduled."
        );
      }
      if (
        postgresErrorMatches(publishResponse.error, "22023", "invalid_scope_month") ||
        postgresErrorMatches(
          publishResponse.error,
          "22023",
          "invalid_schedule_payload"
        ) ||
        postgresErrorMatches(publishResponse.error, "22023", "invalid_unit_key") ||
        postgresErrorMatches(
          publishResponse.error,
          "22023",
          "scheduled_date_outside_scope_month"
        ) ||
        postgresErrorMatches(publishResponse.error, "22023", "duplicate_goal_unit") ||
        postgresErrorMatches(publishResponse.error, "22023", "duplicate_goal_date") ||
        postgresErrorMatches(publishResponse.error, "22023", "unknown_goal")
      ) {
        throw new PlannerRouteError(
          400,
          "validation_failed",
          "Planner publish payload failed validation."
        );
      }
      throw new PlannerRouteError(
        409,
        "publish_failed",
        "Planner publish could not be completed.",
        { cause: publishResponse.error.message }
      );
    }
    const publishedRow = Array.isArray(publishResponse.data)
      ? publishResponse.data[0]
      : publishResponse.data;
    if (!publishedRow) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner publish did not return persisted plan metadata."
      );
    }
    return NextResponse.json(
      {
        schemaVersion: "1",
        replayed: false,
        upsertedCount:
          typeof publishedRow.upserted_count === "number"
            ? publishedRow.upserted_count
            : 0,
        revisions: {
          canonicalRevision: 0,
          executionRevision: 0,
        },
        scheduleDigest:
          typeof publishedRow.schedule_digest === "string"
            ? publishedRow.schedule_digest
            : null,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );

  } catch (error) {
    if (error instanceof PlannerError) {
      const routeError = plannerKernelErrorToRouteError(error);
      return plannerErrorResponse(routeError, correlationId);
    }
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}

export async function POST(request: Request) {
  return handlePlannerSave(request);
}
