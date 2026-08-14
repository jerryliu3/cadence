import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  resolveCanonicalAsOfDate,
  withPlannerRoute,
} from "@/lib/planner/api";
import { goalAssessmentSchema } from "@/lib/planner/assessment";
import {
  loadPlannerCanonicalSnapshot,
  loadPlannerContextPayload,
} from "@/lib/planner/context-loader";
import {
  MAX_API_BODY_BYTES,
  PLANNER_ELIGIBILITY_MODES,
  PLANNER_CONTRACT_VERSION,
} from "@/lib/planner/contracts/bounds";
import { PlannerError, runPlannerKernel } from "@/lib/planner/kernel";
import { findUnhonoredDraftPins } from "@/lib/planner/draft-pins";
import {
  buildDraftPinnedDatesFromCommands,
  plannerDraftCommandSchema,
} from "@/lib/planner/draft-commands";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import {
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import { createClient } from "@/lib/supabase/server";
import {
  assertDateWindow,
  getScopeDateRange,
  toKernelWindowFromDates,
} from "@/lib/planner/dates";

export const runtime = "nodejs";

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
  visibleStart: z.iso.date().optional(),
  visibleEnd: z.iso.date().optional(),
});

const previewRequestSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
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
    /**
     * `replan` is a proposal-generation mode: the caller diffs the result against
     * the current preview, turns the differences into `move_item` draft commands,
     * then re-requests a `stable` preview pinned to those commands. A `replan`
     * preview must never be stored as the draft or sent to save; the save route
     * always solves `stable`, so its hash would not match.
     */
    solveIntent: z.enum(["stable", "replan"]).default("stable"),
    draftCommands: z.array(plannerDraftCommandSchema).max(4000).default([]),
  })
  .superRefine((value, ctx) => {
    try {
      assertDateWindow({ start: value.startDate, end: value.endDate });
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid planner window.",
        path: ["endDate"],
      });
    }
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
  startDate,
  endDate,
  requestedAsOfDate,
  requestedTimezone,
  requestedPolicy,
  snapshot,
  assessments,
  requireExplicitTimezone,
  includeKernel = true,
  preserveExistingAssignments = false,
  solveIntent = "stable",
  draftPinnedDates = {},
}: {
  ownerId: string;
  startDate: string;
  endDate: string;
  requestedAsOfDate?: string;
  requestedTimezone?: string;
  requestedPolicy?: unknown;
  snapshot: PlannerCanonicalSnapshotResult;
  assessments?: ReturnType<typeof goalAssessmentSchema.parse>[];
  requireExplicitTimezone: boolean;
  includeKernel?: boolean;
  preserveExistingAssignments?: boolean;
  solveIntent?: "stable" | "replan";
  draftPinnedDates?: Record<string, string>;
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
        ...toKernelWindowFromDates({ start: startDate, end: endDate }),
        asOfDate,
        timezone: effectiveTimezone,
        goals: snapshot.goals,
        completions: snapshot.completions,
        links: snapshot.links,
        assessments,
        policy: effectivePolicy,
        basePlan: snapshot.activePlan?.basePlan ?? null,
        preserveExistingAssignments,
        solveIntent,
        draftPinnedDates,
      })
    : null;

  if (preview) {
    const { violations: draftPinViolations } = findUnhonoredDraftPins({
      workUnits: preview.workUnits,
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
  }

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
    });

    const url = new URL(request.url);
    const parsedQuery = contextQuerySchema.safeParse({
      scopeMonth: url.searchParams.get("scopeMonth") ?? undefined,
      asOfDate: url.searchParams.get("asOfDate") ?? undefined,
      timezone: url.searchParams.get("timezone") ?? undefined,
      visibleStart: url.searchParams.get("visibleStart") ?? undefined,
      visibleEnd: url.searchParams.get("visibleEnd") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Provide a valid scope month and optional bounded planner context dates."
      );
    }

    const defaultWindow = getScopeDateRange(parsedQuery.data.scopeMonth);
    const visibleStart = parsedQuery.data.visibleStart ?? defaultWindow.start;
    const visibleEnd = parsedQuery.data.visibleEnd ?? defaultWindow.end;
    if (
      (parsedQuery.data.visibleStart === undefined) !==
        (parsedQuery.data.visibleEnd === undefined) ||
      visibleEnd < visibleStart
    ) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Provide both visible planner dates in ascending order."
      );
    }
    let responsePayload: Awaited<ReturnType<typeof loadPlannerContextPayload>>;
    try {
      responsePayload = await loadPlannerContextPayload({
        supabase: routeContext.supabase,
        ownerId: routeContext.userId,
        capabilities: routeContext.capabilities,
        scopeMonth: parsedQuery.data.scopeMonth,
        startDate: visibleStart,
        endDate: visibleEnd,
        correlationId,
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        throw plannerKernelErrorToRouteError(error);
      }
      throw error;
    }

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
    });

    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      previewRequestSchema
    );
    const kernelWindow = toKernelWindowFromDates({
      start: body.startDate,
      end: body.endDate,
    });
    const snapshot = await loadPlannerCanonicalSnapshot({
      supabase: routeContext.supabase,
      ownerId: routeContext.userId,
      ...kernelWindow,
    });

    let resolvedPreview: ReturnType<typeof resolvePlannerPreview>;
    try {
      resolvedPreview = resolvePlannerPreview({
        ownerId: routeContext.userId,
        ...kernelWindow,
        requestedAsOfDate: body.asOfDate,
        requestedTimezone: body.timezone,
        requestedPolicy: body.policy,
        snapshot,
        requireExplicitTimezone: true,
        preserveExistingAssignments: (body.solveIntent ?? "stable") !== "replan",
        solveIntent: body.solveIntent ?? "stable",
        draftPinnedDates: buildDraftPinnedDatesFromCommands(
          body.draftCommands ?? []
        ),
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
      startDate: body.startDate,
      endDate: body.endDate,
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
