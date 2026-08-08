import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
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
import { runPlannerKernel } from "@/lib/planner/kernel";
import {
  buildPlannerConfirmationHash,
  PlannerDraftEditValidationError,
  buildPlannerPublishPersistencePayload,
  buildPlannerPublishRequestDigest,
  plannerPlanMetadataFromKernel,
} from "@/lib/planner/publish-payload";
import { buildPlannerPublishTelemetryCounts } from "@/lib/planner/publish-telemetry";
import {
  plannerDraftCommandSchema,
} from "@/lib/planner/draft-commands";
import {
  scopeMonthDate,
  syncPlannerItemsFromActiveExecutionPlan,
} from "@/lib/planner/planner-items-runtime-sync";
import { monthFromDate } from "@/lib/planner/dates";
import { plannerPolicySchema } from "@/lib/planner/policy";
import { classifyTelemetryResult, emitTelemetryEvent } from "@/lib/telemetry/runtime";
import type { Database, Json } from "@/lib/supabase/database.types";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type PublishExecutionPlanArgs =
  Database["public"]["Functions"]["publish_execution_plan_service"]["Args"];

const publishSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
  expectedBasePlanId: z.string().uuid().nullable(),
  expectedBasePlanVersion: z.number().int().positive().nullable(),
  confirmationHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  policy: z.unknown().optional(),
  eligibilityMode: z.enum(PLANNER_ELIGIBILITY_MODES).optional(),
  draftCommands: z.array(plannerDraftCommandSchema).max(4000).default([]),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let telemetryOwnerId: string | null = null;
  let telemetryCapabilities:
    | Awaited<ReturnType<typeof requirePlannerRouteContext>>["capabilities"]
    | null = null;
  let telemetryScope: { month: string; timezone: string } | null = null;
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerPlanWrites",
      disabledCode: "planner_plan_writes_disabled",
      disabledMessage: "Planner write APIs are not enabled for this owner.",
    });
    telemetryOwnerId = routeContext.userId;
    telemetryCapabilities = routeContext.capabilities;
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
    telemetryScope = { month: body.scopeMonth, timezone: "UTC" };
    if (
      (body.expectedBasePlanId === null) !==
      (body.expectedBasePlanVersion === null)
    ) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Expected base plan id and version must be provided together."
      );
    }

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Provide an Idempotency-Key header for planner publish."
      );
    }
    if (!z.uuid().safeParse(idempotencyKey).success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Idempotency-Key must be a UUID."
      );
    }

    const publishIntent = {
      eligibilityMode: effectiveEligibilityMode,
      scopeMonth: body.scopeMonth,
      previewHash: body.previewHash,
      expectedCanonicalRevision: body.expectedCanonicalRevision,
      expectedExecutionRevision: body.expectedExecutionRevision,
      expectedBasePlanId: body.expectedBasePlanId,
      expectedBasePlanVersion: body.expectedBasePlanVersion,
      policyOverride: requestedPolicy,
      draftCommands,
    };
    const requestDigest = buildPlannerPublishRequestDigest({
      ownerId: routeContext.userId,
      idempotencyKey,
      intent: publishIntent,
    });

    const admin = requirePlannerAdminClient();
    const replayLookup = await admin
      .from("execution_plans")
      .select("id, version, status, scope_month, request_digest, placement_status, generation_source, timezone")
      .eq("owner_id", routeContext.userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (replayLookup.error) {
      throw new PlannerRouteError(
        500,
        "publish_lookup_failed",
        "Planner publish state could not be loaded.",
        { cause: replayLookup.error.message }
      );
    }

    if (replayLookup.data) {
      if (replayLookup.data.request_digest !== requestDigest) {
        throw new PlannerRouteError(
          409,
          "idempotency_key_conflict",
          "Idempotency key was already used for a different planner publish."
        );
      }

      const currentActive = await admin
        .from("execution_plans")
        .select("id")
        .eq("owner_id", routeContext.userId)
        .eq("scope_month", replayLookup.data.scope_month)
        .eq("status", "active")
        .maybeSingle();
      if (currentActive.error) {
        throw new PlannerRouteError(
          500,
          "publish_lookup_failed",
          "Planner publish replay state could not be loaded.",
          { cause: currentActive.error.message }
        );
      }
      const revisionsResponse = await routeContext.supabase.rpc("get_planner_state");
      if (revisionsResponse.error) {
        throw new PlannerRouteError(
          500,
          "revision_load_failed",
          "Planner revision state could not be loaded."
        );
      }
      const revisions = (
        (revisionsResponse.data as
          | Array<{ canonical_revision: number; execution_revision: number }>
          | null) ?? []
      )[0] ?? {
        canonical_revision: 0,
        execution_revision: 0,
      };
      const replayScopeMonth =
        typeof replayLookup.data.scope_month === "string" &&
        replayLookup.data.scope_month.length >= 7
          ? monthFromDate(replayLookup.data.scope_month)
          : body.scopeMonth;
      const replaySync = await syncPlannerItemsFromActiveExecutionPlan({
        admin,
        ownerId: routeContext.userId,
        correlationId,
        scopeMonth: replayScopeMonth,
        source: "planner-publish",
      });
      const replayScheduleDigest = replaySync.scheduleDigest;
      emitTelemetryEvent({
        eventName: "planner.publish.completed",
        ownerId: routeContext.userId,
        correlationId,
        capabilities: routeContext.capabilities,
        scope: {
          month: body.scopeMonth,
          timezone: (replayLookup.data.timezone as string) ?? "UTC",
        },
        result: "success",
        statusCode: 200,
        errorCode: null,
        durationMs: Date.now() - startedAt,
        replay: true,
        data: {
          source:
            ((replayLookup.data.generation_source as string | null) ??
              "manual") === "ai"
              ? "ai"
              : ((replayLookup.data.generation_source as string | null) ??
                    "manual") === "update"
                ? "update"
                : "manual",
          placementStatus:
            (replayLookup.data.placement_status as "complete" | "partial" | null) ??
            "partial",
          activated: replayLookup.data.status === "active",
        },
      });
      return NextResponse.json(
        {
          schemaVersion: "1",
          planId: replayLookup.data.id,
          version: replayLookup.data.version,
          replayed: true,
          isCurrentlyActive: replayLookup.data.status === "active",
          currentActivePlanId: currentActive.data?.id ?? null,
          revisions: {
            canonicalRevision: revisions.canonical_revision,
            executionRevision: revisions.execution_revision,
          },
          scheduleDigest: replayScheduleDigest,
          correlationId,
        },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      scopeMonth: body.scopeMonth,
    });
    if (
      snapshot.revisions.canonicalRevision !== body.expectedCanonicalRevision ||
      snapshot.revisions.executionRevision !== body.expectedExecutionRevision
    ) {
      throw new PlannerRouteError(
        409,
        "stale_revision",
        "Planner publish revisions are stale. Refresh and try again."
      );
    }
    const liveBasePlanId = snapshot.activePlan?.plan.id ?? null;
    const liveBasePlanVersion = snapshot.activePlan?.plan.version ?? null;
    if (
      liveBasePlanId !== body.expectedBasePlanId ||
      liveBasePlanVersion !== body.expectedBasePlanVersion
    ) {
      throw new PlannerRouteError(
        409,
        "base_plan_conflict",
        "The active plan changed before publish. Refresh and retry."
      );
    }

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
    telemetryScope = {
      month: body.scopeMonth,
      timezone: snapshot.preferences.timezone,
    };
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
        assessments,
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
    const metadata = plannerPlanMetadataFromKernel({
      timezone: snapshot.preferences.timezone,
      kernel,
    });

    const publishArgs: PublishExecutionPlanArgs = {
        p_owner: routeContext.userId,
        p_scope_month: scopeMonthDate(body.scopeMonth),
        p_eligibility_mode: effectiveEligibilityMode,
        p_timezone: metadata.timezone,
        p_generation_source: persistence.generationSource,
        p_change_summary: persistence.changeSummary,
        p_policy_snapshot: effectivePolicy,
        p_generation_input_hash: metadata.generationInputHash,
        p_contract_version: metadata.contractVersion,
        p_scheduler_version: metadata.schedulerVersion,
        p_requirement_schema_version: metadata.requirementSchemaVersion,
        p_assessment_schema_version: metadata.assessmentSchemaVersion,
        p_policy_schema_version: metadata.policySchemaVersion,
        p_policy_compiler_version: metadata.policyCompilerVersion,
        p_placement_status: metadata.placementStatus,
        p_search_status: metadata.searchStatus,
        p_capacity_status: metadata.capacityStatus,
        p_confirmation_required: metadata.confirmationRequired,
        p_publishable: metadata.publishable,
        p_idempotency_key: idempotencyKey,
        p_request_digest: requestDigest,
        p_expected_canonical_revision: body.expectedCanonicalRevision,
        p_expected_execution_revision: body.expectedExecutionRevision,
        p_expected_base_plan_id:
          body.expectedBasePlanId as PublishExecutionPlanArgs["p_expected_base_plan_id"],
        p_expected_base_plan_version:
          body.expectedBasePlanVersion as PublishExecutionPlanArgs["p_expected_base_plan_version"],
        p_goals: persistence.goals as Json,
        p_days: persistence.days as Json,
        p_items: persistence.items as Json,
        p_issues: persistence.issues as Json,
      };
    const publishResponse = await callAdminRpc(
      admin,
      "publish_execution_plan_service",
      publishArgs
    );
    if (publishResponse.error) {
      const message = publishResponse.error.message.toLowerCase();
      if (message.includes("planner revision mismatch")) {
        throw new PlannerRouteError(
          409,
          "stale_revision",
          "Planner publish revisions are stale. Refresh and try again."
        );
      }
      if (message.includes("base plan mismatch")) {
        throw new PlannerRouteError(
          409,
          "base_plan_conflict",
          "The active plan changed before publish. Refresh and retry."
        );
      }
      if (message.includes("idempotency digest mismatch")) {
        throw new PlannerRouteError(
          409,
          "idempotency_key_conflict",
          "Idempotency key was already used for a different planner publish."
        );
      }
      if (message.includes("only publishable active plans may be inserted")) {
        throw new PlannerRouteError(
          422,
          "planner_not_publishable",
          "Publish is blocked because this preview is not currently publishable.",
          {
            issueCodes: kernel.solver.issueCodes,
            searchStatus: kernel.solver.searchStatus,
            invalidGoalIds: kernel.solver.invalidGoalIds,
            confirmationRequired: kernel.solver.confirmationRequired,
          }
        );
      }
      if (message.includes("cross_plan_goal_unit_conflict")) {
        throw new PlannerRouteError(
          409,
          "cross_plan_conflict",
          "Another active month plan already owns this goal unit."
        );
      }
      if (message.includes("elapsed_scope_month_publish_forbidden")) {
        throw new PlannerRouteError(
          422,
          "validation_failed",
          "Publishing an elapsed month is not supported. Publish the current or a future month."
        );
      }
      if (message.includes("cross_plan_goal_date_conflict")) {
        throw new PlannerRouteError(
          409,
          "cross_plan_conflict",
          "Another active month plan already schedules this goal on the destination date."
        );
      }
      if (
        message.includes("execution_plan_goals_default_local_time_format") ||
        message.includes("execution_plan_items_scheduled_time_override_format") ||
        message.includes("execution_plan_items_effective_scheduled_local_time_format") ||
        message.includes("invalid eligibility mode")
      ) {
        throw new PlannerRouteError(
          422,
          "time_validation_failed",
          "Publish is blocked because one or more proposed session times are invalid."
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
    const publishSync = await syncPlannerItemsFromActiveExecutionPlan({
      admin,
      ownerId: routeContext.userId,
      correlationId,
      scopeMonth: body.scopeMonth,
      source: "planner-publish",
    });
    const publishScheduleDigest = publishSync.scheduleDigest;

    emitTelemetryEvent({
      eventName: "planner.publish.completed",
      ownerId: routeContext.userId,
      correlationId,
      capabilities: routeContext.capabilities,
      scope: {
        month: body.scopeMonth,
        timezone: snapshot.preferences.timezone,
      },
      result:
        metadata.placementStatus === "partial" ? "partial" : "success",
      statusCode: 200,
      errorCode: null,
      durationMs: Date.now() - startedAt,
      replay: Boolean(publishedRow.replayed),
      counts: {
        eligibleGoals: snapshot.goals.length,
        ...buildPlannerPublishTelemetryCounts(kernel.workUnits),
      },
      data: {
        source: persistence.generationSource === "update" ? "update" : "manual",
        placementStatus: metadata.placementStatus,
        activated: Boolean(publishedRow.is_currently_active),
      },
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        planId: publishedRow.plan_id as string,
        version: publishedRow.version as number,
        replayed: Boolean(publishedRow.replayed),
        isCurrentlyActive: Boolean(publishedRow.is_currently_active),
        currentActivePlanId: (publishedRow.current_active_plan_id as string | null) ?? null,
        revisions: {
          canonicalRevision: body.expectedCanonicalRevision,
          executionRevision: publishedRow.execution_revision as number,
        },
        scheduleDigest: publishScheduleDigest,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );

  } catch (error) {
    if (error instanceof PlannerRouteError) {
      if (telemetryOwnerId && telemetryCapabilities && telemetryScope) {
        emitTelemetryEvent({
          eventName: "planner.publish.completed",
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
            source: "manual",
            placementStatus: "partial",
            activated: false,
          },
        });
        if (error.code === "invariant_failed") {
          emitTelemetryEvent({
            eventName: "planner.invariant.failed",
            ownerId: telemetryOwnerId,
            correlationId,
            capabilities: telemetryCapabilities,
            scope: telemetryScope,
            result: "error",
            statusCode: 500,
            errorCode: error.code,
            durationMs: Date.now() - startedAt,
            counts: {},
            data: {
              invariantCode: error.code,
              stage: "publish",
            },
          });
        }
      }
      return plannerErrorResponse(error, correlationId);
    }
    if (telemetryOwnerId && telemetryCapabilities && telemetryScope) {
      emitTelemetryEvent({
        eventName: "planner.publish.completed",
        ownerId: telemetryOwnerId,
        correlationId,
        capabilities: telemetryCapabilities,
        scope: telemetryScope,
        result: "error",
        statusCode: 500,
        errorCode: "internal_error",
        durationMs: Date.now() - startedAt,
        data: {
          source: "manual",
          placementStatus: "partial",
          activated: false,
        },
      });
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
