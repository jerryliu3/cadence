import { parseBoundedJsonBody } from "@/lib/api/body";
import { createCorrelationId, requireAuthenticatedUser } from "@/lib/api/context";
import {
  RouteError,
  routeErrorResponse,
  type RouteErrorBody,
  unknownRouteErrorResponse,
} from "@/lib/api/errors";
import { getDateInTimezone } from "@/lib/dates/timezone";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import type { PlannerCapabilities } from "@/lib/planner/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

export type PlannerApiErrorBody = RouteErrorBody;
export { createCorrelationId, parseBoundedJsonBody };
export { RouteError as PlannerRouteError };

export function plannerErrorResponse(
  error: RouteError,
  correlationId: string
) {
  return routeErrorResponse(error, correlationId);
}

export function unknownPlannerErrorResponse(correlationId: string) {
  return unknownRouteErrorResponse({
    correlationId,
    message: "Planner request failed unexpectedly.",
  });
}

export function resolveCanonicalAsOfDate({
  timezone,
  requestedAsOfDate,
}: {
  timezone: string;
  requestedAsOfDate?: string;
}) {
  const canonicalAsOfDate = getDateInTimezone(new Date(), timezone);
  if (
    requestedAsOfDate !== undefined &&
    requestedAsOfDate !== canonicalAsOfDate
  ) {
    throw new PlannerRouteError(
      409,
      "as_of_date_conflict",
      "Planner as-of date must match the current server-local day.",
      {
        canonicalAsOfDate,
      }
    );
  }
  return canonicalAsOfDate;
}

export interface AuthenticatedPlannerRouteContext {
  userId: string;
  supabase: ServerSupabaseClient;
  capabilities: PlannerCapabilities;
}

export function requirePlannerAdminClient() {
  try {
    return createAdminClient();
  } catch {
    throw new PlannerRouteError(
      503,
      "admin_configuration_invalid",
      "Planner write APIs are unavailable until server admin credentials are configured."
    );
  }
}

export async function requirePlannerRouteContext({
  supabase,
  disabledCode,
  disabledMessage,
  disabledStatus = 503,
}: {
  supabase: ServerSupabaseClient;
  disabledCode: string;
  disabledMessage: string;
  disabledStatus?: number;
}): Promise<AuthenticatedPlannerRouteContext> {
  const { userId } = await requireAuthenticatedUser(supabase, {
    message: "Sign in to access planner APIs.",
  });

  let capabilities: PlannerCapabilities;
  try {
    capabilities = getPlannerCapabilities();
  } catch {
    throw new PlannerRouteError(
      503,
      "capability_configuration_invalid",
      "Planner capabilities are temporarily unavailable."
    );
  }

  if (!capabilities.calendarEnabled) {
    throw new PlannerRouteError(disabledStatus, disabledCode, disabledMessage);
  }

  return {
    userId,
    supabase,
    capabilities,
  };
}
