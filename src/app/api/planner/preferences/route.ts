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
  POLICY_COMPILER_VERSION,
  POLICY_SCHEMA_VERSION,
} from "@/lib/planner/contracts/bounds";
import { createDefaultPlannerPolicy, plannerPolicySchema } from "@/lib/planner/policy";
import {
  parsePlannerLegacyPreferencesRow,
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
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

function shouldIgnoreLegacyPreferenceError(error: { code?: string | null }) {
  const code = (error.code ?? "").toUpperCase();
  return code === "42P01" || code === "PGRST205";
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

    const [profileResponse, legacyResponse, revisionsResponse] = await Promise.all([
      routeContext.supabase
        .from("profiles")
        .select(
          "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
        )
        .eq("id", routeContext.userId)
        .maybeSingle(),
      routeContext.supabase
        .from("planner_preferences")
        .select("timezone,timezone_confirmed_at,policy_revision,default_policy")
        .eq("owner_id", routeContext.userId)
        .maybeSingle(),
      routeContext.supabase.rpc("get_planner_state"),
    ]);
    if (
      (profileResponse.error &&
        !shouldIgnoreProfilePreferenceError(profileResponse.error)) ||
      (legacyResponse.error &&
        !shouldIgnoreLegacyPreferenceError(legacyResponse.error)) ||
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
    const legacy = legacyResponse.data
      ? parsePlannerLegacyPreferencesRow(legacyResponse.data)
      : null;
    const snapshot = resolvePlannerPreferencesSnapshot({
      profile,
      legacy,
    });
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
      ? plannerPolicySchema.parse(body.defaultPolicy)
      : createDefaultPlannerPolicy(body.timezone, timezoneConfirmedAt);
    if (defaultPolicy.timezone !== body.timezone) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Planner preference timezone and policy timezone must match."
      );
    }

    const admin = requirePlannerAdminClient();
    const upsertResponse = await callAdminRpc(
      admin,
      "upsert_planner_preferences_service",
      {
        p_owner: routeContext.userId,
        p_timezone: body.timezone,
        p_default_policy: defaultPolicy,
        p_policy_schema_version: POLICY_SCHEMA_VERSION,
        p_policy_compiler_version: POLICY_COMPILER_VERSION,
        p_timezone_confirmed_at: timezoneConfirmedAt,
      }
    );
    if (upsertResponse.error) {
      throw new PlannerRouteError(
        409,
        "preference_update_failed",
        "Planner preferences could not be updated.",
        { cause: upsertResponse.error.message }
      );
    }

    const updatedRow = Array.isArray(upsertResponse.data)
      ? upsertResponse.data[0]
      : upsertResponse.data;
    if (!updatedRow) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner preference update did not return persisted data."
      );
    }
    const parsedLegacy = parsePlannerLegacyPreferencesRow(updatedRow);

    const profileResponse = await routeContext.supabase
      .from("profiles")
      .select(
        "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
      )
      .eq("id", routeContext.userId)
      .maybeSingle();
    if (
      profileResponse.error &&
      !shouldIgnoreProfilePreferenceError(profileResponse.error)
    ) {
      throw new PlannerRouteError(
        500,
        "preference_update_failed",
        "Planner preferences could not be updated.",
        { cause: profileResponse.error.message }
      );
    }

    const parsedProfile = profileResponse.data
      ? parsePlannerProfilePreferencesRow(profileResponse.data)
      : null;
    const resolvedPreferences = resolvePlannerPreferencesSnapshot({
      profile: parsedProfile,
      legacy: parsedLegacy,
    });
    if (!resolvedPreferences) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner preference update did not produce resolved preference state."
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
