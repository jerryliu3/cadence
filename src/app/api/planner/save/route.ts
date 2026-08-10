import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  withPlannerRoute,
} from "@/lib/planner/api";
import { createDefaultAssessment, goalAssessmentSchema } from "@/lib/planner/assessment";
import { loadPlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import {
  MAX_API_BODY_BYTES,
  PLANNER_ELIGIBILITY_MODES,
} from "@/lib/planner/contracts/bounds";
import { PlannerError, runPlannerKernel } from "@/lib/planner/kernel";
import { findUnhonoredDraftPins } from "@/lib/planner/draft-pins";
import {
  buildPlannerConfirmationHash,
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
} from "@/lib/planner/publish-payload";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import {
  buildDraftPinnedDatesFromCommands,
  plannerDraftCommandSchema,
} from "@/lib/planner/draft-commands";
import { toScopeMonthDate } from "@/lib/planner/scope-month";
import { plannerPolicySchema } from "@/lib/planner/policy";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const publishScopeSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmationHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  policy: z.unknown().optional(),
  eligibilityMode: z.enum(PLANNER_ELIGIBILITY_MODES).optional(),
  draftCommands: z.array(plannerDraftCommandSchema).max(4000).default([]),
  preserveExistingAssignments: z.boolean().optional(),
});

const publishSchema = z.object({
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z.array(publishScopeSchema).min(1).max(12),
});

interface PlannerSaveScheduledItem {
  goal_id: string;
  unit_key: string;
  scheduled_date: string;
  original_scheduled_date: string;
  scheduled_time: string | null;
  locked: boolean;
}

function buildScheduleConflictPayloadDiagnostics(
  scheduledItems: PlannerSaveScheduledItem[]
) {
  const goalIds = new Set<string>();
  const goalDateKeySet = new Set<string>();
  const goalUnitKeySet = new Set<string>();
  const unitKeysByGoalDate = new Map<string, Set<string>>();
  const datesByGoalUnit = new Map<string, Set<string>>();

  for (const item of scheduledItems) {
    goalIds.add(item.goal_id);
    const goalDateKey = `${item.goal_id}:${item.scheduled_date}`;
    const goalUnitKey = `${item.goal_id}:${item.unit_key}`;
    goalDateKeySet.add(goalDateKey);
    goalUnitKeySet.add(goalUnitKey);
    const unitKeys = unitKeysByGoalDate.get(goalDateKey) ?? new Set<string>();
    unitKeys.add(item.unit_key);
    unitKeysByGoalDate.set(goalDateKey, unitKeys);
    const scheduledDates = datesByGoalUnit.get(goalUnitKey) ?? new Set<string>();
    scheduledDates.add(item.scheduled_date);
    datesByGoalUnit.set(goalUnitKey, scheduledDates);
  }

  const duplicateGoalDateEntries = Array.from(unitKeysByGoalDate.entries())
    .filter(([, unitKeys]) => unitKeys.size > 1)
    .map(([goalDateKey, unitKeys]) => {
      const separatorIndex = goalDateKey.lastIndexOf(":");
      return {
        goalId: goalDateKey.slice(0, separatorIndex),
        scheduledDate: goalDateKey.slice(separatorIndex + 1),
        unitKeys: Array.from(unitKeys).sort(),
      };
    });

  const duplicateGoalUnitEntries = Array.from(datesByGoalUnit.entries())
    .filter(([, scheduledDates]) => scheduledDates.size > 1)
    .map(([goalUnitKey, scheduledDates]) => {
      const separatorIndex = goalUnitKey.lastIndexOf(":");
      return {
        goalId: goalUnitKey.slice(0, separatorIndex),
        unitKey: goalUnitKey.slice(separatorIndex + 1),
        scheduledDates: Array.from(scheduledDates).sort(),
      };
    });

  return {
    goalIds: Array.from(goalIds),
    goalDateKeySet,
    goalUnitKeySet,
    duplicateGoalDateEntries,
    duplicateGoalUnitEntries,
  };
}

async function buildScheduleConflictDiagnostics({
  ownerId,
  scheduledItems,
  databaseError,
}: {
  ownerId: string;
  scheduledItems: PlannerSaveScheduledItem[];
  databaseError: {
    code?: string;
    message: string;
    details?: string;
    hint?: string;
  };
}) {
  const payloadDiagnostics =
    buildScheduleConflictPayloadDiagnostics(scheduledItems);
  let adminLookupError: string | null = null;
  const ownerMismatchConflicts: Array<{
    goalId: string;
    unitKey: string;
    scheduledDate: string;
  }> = [];

  if (payloadDiagnostics.goalIds.length > 0) {
    try {
      const admin = requirePlannerAdminClient();
      const adminResponse = await admin
        .from("planner_items")
        .select("owner_id,goal_id,unit_key,scheduled_date")
        .in("goal_id", payloadDiagnostics.goalIds);
      if (adminResponse.error) {
        adminLookupError = adminResponse.error.message;
      } else {
        for (const row of adminResponse.data ?? []) {
          if (row.owner_id === ownerId) {
            continue;
          }
          const goalDateKey = `${row.goal_id}:${row.scheduled_date}`;
          const goalUnitKey = `${row.goal_id}:${row.unit_key}`;
          if (
            !payloadDiagnostics.goalDateKeySet.has(goalDateKey) &&
            !payloadDiagnostics.goalUnitKeySet.has(goalUnitKey)
          ) {
            continue;
          }
          ownerMismatchConflicts.push({
            goalId: row.goal_id,
            unitKey: row.unit_key,
            scheduledDate: row.scheduled_date,
          });
        }
      }
    } catch (error) {
      adminLookupError =
        error instanceof Error ? error.message : "admin_lookup_failed";
    }
  }

  const ownerMismatchSampleLimit = 10;
  return {
    cause: "schedule_conflict",
    databaseErrorCode: databaseError.code ?? null,
    databaseErrorMessage: databaseError.message,
    databaseErrorDetails: databaseError.details ?? null,
    databaseErrorHint: databaseError.hint ?? null,
    submittedItemCount: scheduledItems.length,
    duplicateGoalDateEntries: payloadDiagnostics.duplicateGoalDateEntries,
    duplicateGoalUnitEntries: payloadDiagnostics.duplicateGoalUnitEntries,
    ownerMismatchConflictCount: ownerMismatchConflicts.length,
    ownerMismatchConflictSample: ownerMismatchConflicts.slice(
      0,
      ownerMismatchSampleLimit
    ),
    ownerMismatchConflictSampleTruncated:
      ownerMismatchConflicts.length > ownerMismatchSampleLimit,
    ...(adminLookupError ? { adminLookupError } : {}),
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

export async function handlePlannerSave(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
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
    const allScheduledItems: PlannerSaveScheduledItem[] = [];
    const scheduleBatches: Array<{ scope_month: string; items: PlannerSaveScheduledItem[] }> =
      [];
    for (const scopePublish of body.scopes) {
      try {
        const requestedPolicy = scopePublish.policy
          ? (() => {
              const parsed = plannerPolicySchema.safeParse(scopePublish.policy);
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
        const draftCommands = scopePublish.draftCommands ?? [];
        const draftPinnedDates = buildDraftPinnedDatesFromCommands(draftCommands);
        const effectiveEligibilityMode =
          scopePublish.eligibilityMode ?? PLANNER_ELIGIBILITY_MODES[0];
        const snapshot = await loadPlannerCanonicalSnapshot({
          supabase: routeContext.supabase,
          ownerId: routeContext.userId,
          scopeMonth: scopePublish.scopeMonth,
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
        if (scopePublish.scopeMonth < asOfDate.slice(0, 7)) {
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
        let kernel: ReturnType<typeof runPlannerKernel>;
        try {
          kernel = runPlannerKernel({
            schemaVersion: "1",
            eligibilityMode: effectiveEligibilityMode,
            // Publish always solves `stable`. `replan` exists only to generate move
            // proposals, which reach this route as pinned `move_item` commands.
            solveIntent: "stable",
            preserveExistingAssignments:
              scopePublish.preserveExistingAssignments ?? requestedPolicy === null,
            draftPinnedDates,
            ownerId: routeContext.userId,
            scopeMonth: scopePublish.scopeMonth,
            asOfDate,
            timezone: snapshot.preferences.timezone,
            goals: snapshot.goals,
            completions: snapshot.completions,
            links: snapshot.links,
            assessments,
            policy: effectivePolicy,
            basePlan: snapshot.activePlan?.basePlan ?? null,
          });
        } catch (error) {
          if (error instanceof PlannerError) {
            throw plannerKernelErrorToRouteError(error);
          }
          throw error;
        }

        if (kernel.generationInputHash !== scopePublish.previewHash) {
          throw new PlannerRouteError(
            409,
            "preview_hash_mismatch",
            "Planner preview hash is stale. Regenerate and publish again."
          );
        }

        const { violations: draftPinViolations } = findUnhonoredDraftPins({
          workUnits: kernel.workUnits,
          draftPinnedDates,
        });
        if (draftPinViolations.length > 0) {
          throw new PlannerRouteError(
            422,
            "draft_pin_unhonored",
            "One or more moved sessions no longer fit the current planner constraints. Undo those moves or pick different dates, then regenerate.",
            { violations: draftPinViolations }
          );
        }

        if (kernel.solver.confirmationRequired) {
          const expectedConfirmationHash = buildPlannerConfirmationHash({
            previewHash: scopePublish.previewHash,
            issueCodes: kernel.solver.issueCodes,
          });
          if (scopePublish.confirmationHash !== expectedConfirmationHash) {
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
        const scheduledItems: PlannerSaveScheduledItem[] = persistence.items
          .filter(
            (
              item
            ): item is (typeof persistence.items)[number] & { scheduled_date: string } =>
              item.scheduled_date !== null
          )
          .map((item) => ({
            goal_id: item.goal_id,
            unit_key: item.unit_key,
            scheduled_date: item.scheduled_date,
            original_scheduled_date:
              item.original_scheduled_date ?? item.scheduled_date,
            scheduled_time:
              item.scheduled_time_override ??
              item.effective_scheduled_local_time ??
              null,
            locked: item.locked,
          }));
        allScheduledItems.push(...scheduledItems);
        scheduleBatches.push({
          scope_month: toScopeMonthDate(scopePublish.scopeMonth),
          items: scheduledItems,
        });
      } catch (error) {
        if (error instanceof PlannerRouteError) {
          throw new PlannerRouteError(
            error.status,
            error.code,
            error.message,
            {
              ...(error.details ?? {}),
              scopeMonth: scopePublish.scopeMonth,
            }
          );
        }
        throw error;
      }
    }
    const publishResponse = await routeContext.supabase.rpc(
      "set_planner_schedule_batch",
      {
        p_batches: scheduleBatches as unknown as Json,
        p_expected_digest: body.expectedDigest,
      }
    );
    if (publishResponse.error) {
      if (postgresErrorMatches(publishResponse.error, "P0001", "stale_schedule")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner publish state is stale. Refresh and try again."
        );
      }
      if (postgresErrorMatches(publishResponse.error, "P0001", "schedule_conflict")) {
        const diagnostics = await buildScheduleConflictDiagnostics({
          ownerId: routeContext.userId,
          scheduledItems: allScheduledItems,
          databaseError: {
            code: publishResponse.error.code,
            message: publishResponse.error.message,
            details: publishResponse.error.details ?? undefined,
            hint: publishResponse.error.hint ?? undefined,
          },
        });
        console.error("planner save schedule conflict", correlationId, diagnostics);
        throw new PlannerRouteError(
          409,
          "schedule_conflict",
          "Planner publish hit an internal schedule conflict. Regenerate and try again.",
          diagnostics
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
        postgresErrorMatches(
          publishResponse.error,
          "22023",
          "invalid_schedule_batch_payload"
        ) ||
        postgresErrorMatches(publishResponse.error, "22023", "duplicate_scope_month") ||
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
        publishedScopes: body.scopes.map((scope) => scope.scopeMonth),
        scheduleDigest:
          typeof publishedRow.schedule_digest === "string"
            ? publishedRow.schedule_digest
            : null,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}

export async function POST(request: Request) {
  return handlePlannerSave(request);
}
