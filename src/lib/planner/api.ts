import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId as createSharedCorrelationId,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute as withSharedRoute,
} from "@/lib/api/route";
import { getDateInTimezone } from "@/lib/dates/timezone";
import { getPlannerCapabilities } from "@/lib/planner/capabilities";
import type { PlannerCapabilities } from "@/lib/planner/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

export interface PlannerApiErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export class PlannerRouteError extends ApiRouteError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(status, code, message, details, cause);
    this.name = "PlannerRouteError";
  }
}

export function createCorrelationId() {
  return createSharedCorrelationId();
}

export function plannerErrorResponse(
  error: PlannerRouteError,
  correlationId: string
) {
  return apiErrorResponse(error, correlationId);
}

export function unknownPlannerErrorResponse(correlationId: string) {
  return plannerErrorResponse(
    new PlannerRouteError(
      500,
      "internal_error",
      "Planner request failed unexpectedly."
    ),
    correlationId
  );
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

export async function parseBoundedJsonBody<T>(
  request: Request,
  maxBytes: number,
  schema: z.ZodType<T>
) {
  try {
    return await parseJsonBody({
      request,
      maxBytes,
      schema,
    });
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw new PlannerRouteError(
        error.status,
        error.code,
        error.message,
        error.details,
        (error as Error & { cause?: unknown }).cause
      );
    }
    throw error;
  }
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
  const { userId } = await requireAuthenticatedRouteContext({
    supabase,
    unauthorizedMessage: "Sign in to access planner APIs.",
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

export async function withPlannerRoute(
  handler: (context: { correlationId: string }) => Promise<NextResponse>
) {
  return withSharedRoute(handler, {
    onError: (error, correlationId) => {
      if (error instanceof PlannerRouteError) {
        return plannerErrorResponse(error, correlationId);
      }
      return unknownPlannerErrorResponse(correlationId);
    },
  });
}
