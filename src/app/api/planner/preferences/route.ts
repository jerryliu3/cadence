import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import {
  MAX_API_BODY_BYTES,
} from "@/lib/planner/contracts/bounds";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import {
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const upsertSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidIanaTimezone),
  defaultPolicy: z.unknown().optional(),
});

function shouldIgnoreProfilePreferenceError(error: { code?: string | null }) {
  const code = (error.code ?? "").toUpperCase();
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

export async function GET() {
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

    const [profileResponse, revisionsResponse] = await Promise.all([
      routeContext.supabase
        .from("profiles")
        .select(
          "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
        )
        .eq("id", routeContext.userId)
        .maybeSingle(),
      routeContext.supabase.rpc("get_planner_state"),
    ]);
    if (
      (profileResponse.error &&
        !shouldIgnoreProfilePreferenceError(profileResponse.error)) ||
      revisionsResponse.error
    ) {
      throw new PlannerRouteError(
        500,
        "preference_load_failed",
        "Planner preferences could not be loaded."
      );
    }

    const profile = profileResponse.data
      ? parsePlannerProfilePreferencesRow(profileResponse.data)
      : null;
    const snapshot = resolvePlannerPreferencesSnapshot({ profile });
    const preferences = snapshot
      ? {
          timezone: snapshot.timezone,
          timezoneConfirmedAt: snapshot.timezone_confirmed_at,
          policyRevision: snapshot.policy_revision,
          defaultPolicy: snapshot.default_policy,
        }
      : null;
    const revisions = (
      (revisionsResponse.data as
        | Array<{ canonical_revision: number; execution_revision: number }>
        | null) ?? []
    )[0] ?? {
      canonical_revision: 0,
      execution_revision: 0,
    };

    return NextResponse.json(
      {
        schemaVersion: "1",
        preferences,
        revisions: {
          canonicalRevision: revisions.canonical_revision,
          executionRevision: revisions.execution_revision,
        },
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}

export async function PUT(request: Request) {
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
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      upsertSchema
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

    const normalizedWeekStartsOn =
      defaultPolicy.weekStartsOn !== undefined &&
      defaultPolicy.weekStartsOn >= 0 &&
      defaultPolicy.weekStartsOn <= 6
        ? defaultPolicy.weekStartsOn
        : 1;
    const normalizedRestWeekdays = Array.from(
      new Set(defaultPolicy.restWeekdays)
    ).sort((left, right) => left - right);

    const admin = requirePlannerAdminClient();
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

    const revisionsResponse = await routeContext.supabase.rpc("get_planner_state");
    if (revisionsResponse.error) {
      // The write has already committed; return a degraded revision snapshot.
      console.error("[planner.preferences.put] post-commit revision reload failed", {
        correlationId,
        ownerId: routeContext.userId,
        code: revisionsResponse.error.code,
        message: revisionsResponse.error.message,
      });
    }
    const revisions = (
      revisionsResponse.error
        ? null
        : ((revisionsResponse.data as
            | Array<{ canonical_revision: number; execution_revision: number }>
            | null) ?? [])
    )?.[0] ?? {
        canonical_revision: 0,
        execution_revision: 0,
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
          canonicalRevision: revisions.canonical_revision,
          executionRevision: revisions.execution_revision,
        },
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
