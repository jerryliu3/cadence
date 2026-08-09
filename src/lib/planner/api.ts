import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId as createHttpCorrelationId,
  HttpRouteError,
  parseBoundedJsonBody as parseSharedBoundedJsonBody,
} from "@/lib/api/http-route";
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

export class PlannerRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlannerRouteError";
  }
}

export function createCorrelationId() {
  return createHttpCorrelationId();
}

export function plannerErrorResponse(
  error: PlannerRouteError,
  correlationId: string
) {
  const payload: PlannerApiErrorBody = {
    code: error.code,
    message: error.message,
    correlationId,
  };
  if (error.details) {
    payload.details = error.details;
  }

  return NextResponse.json(payload, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
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

export function plannerWritesNotReleasedError() {
  return new PlannerRouteError(
    503,
    "planner_writes_not_released",
    "Planner write APIs will be enabled after the read/preview-only soak."
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
    return await parseSharedBoundedJsonBody(request, maxBytes, schema);
  } catch (error) {
    if (error instanceof HttpRouteError) {
      throw new PlannerRouteError(
        error.status,
        error.code,
        error.message,
        error.details
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new PlannerRouteError(
      401,
      "authentication_required",
      "Sign in to access planner APIs."
    );
  }

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
    userId: user.id,
    supabase,
    capabilities,
  };
}
