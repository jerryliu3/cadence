import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
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
  return randomUUID();
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
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PlannerRouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new PlannerRouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new PlannerRouteError(
      400,
      "invalid_json",
      "Request body must be valid JSON."
    );
  }

  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    throw new PlannerRouteError(
      400,
      "validation_failed",
      "Request payload failed validation.",
      { issues: parsed.error.issues }
    );
  }
  return parsed.data;
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
  requiredCapability,
  disabledCode,
  disabledMessage,
  disabledStatus = 503,
}: {
  supabase: ServerSupabaseClient;
  requiredCapability:
    | "plannerRead"
    | "plannerGeneration"
    | "plannerPlanWrites"
    | "targetedExactCompletion"
    | "coachAi";
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

  if (!capabilities[requiredCapability]) {
    throw new PlannerRouteError(disabledStatus, disabledCode, disabledMessage);
  }

  return {
    userId: user.id,
    supabase,
    capabilities,
  };
}
