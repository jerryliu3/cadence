import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCorrelationId as createSharedCorrelationId,
  HttpRouteError,
  parseBoundedJsonBody,
} from "@/lib/api/http-route";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type PostgrestErrorLike = {
  code?: string | null;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export class ApiRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(message);
    this.name = "ApiRouteError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function createCorrelationId() {
  return createSharedCorrelationId();
}

export function apiErrorResponse(error: ApiRouteError, correlationId: string) {
  return NextResponse.json(
    {
      code: error.code,
      message: error.message,
      correlationId,
      details: error.details,
    },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export function apiSuccessResponse<T extends Record<string, unknown>>(
  payload: T,
  correlationId: string,
  status = 200
) {
  return NextResponse.json(
    {
      schemaVersion: "1",
      correlationId,
      ...payload,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function isRlsDeniedError(error: PostgrestErrorLike) {
  const lowerMessage = (error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    lowerMessage.includes("row-level security") ||
    lowerMessage.includes("permission denied")
  );
}

function isUniqueViolation(error: PostgrestErrorLike) {
  return error.code === "23505";
}

function toPostgrestErrorLike(error: unknown): PostgrestErrorLike | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as Record<string, unknown>;
  if (typeof candidate.message !== "string") {
    return null;
  }
  return {
    code:
      typeof candidate.code === "string" ? candidate.code : null,
    message: candidate.message,
    details:
      typeof candidate.details === "string" ? candidate.details : null,
    hint: typeof candidate.hint === "string" ? candidate.hint : null,
  };
}

export function mapPostgrestWriteError({
  error,
  fallbackCode,
  fallbackMessage,
}: {
  error: unknown;
  fallbackCode: string;
  fallbackMessage: string;
}) {
  const dbError = toPostgrestErrorLike(error);
  if (!dbError) {
    return new ApiRouteError(500, fallbackCode, fallbackMessage, undefined, error);
  }
  if (isRlsDeniedError(dbError)) {
    return new ApiRouteError(
      403,
      "forbidden",
      "You do not have permission to perform this action.",
      undefined,
      dbError
    );
  }
  if (isUniqueViolation(dbError)) {
    return new ApiRouteError(
      409,
      "conflict",
      "The requested change conflicts with existing data.",
      undefined,
      dbError
    );
  }
  return new ApiRouteError(500, fallbackCode, fallbackMessage, undefined, dbError);
}

export const mapPostgresError = mapPostgrestWriteError;

function logApiRouteError(error: unknown, correlationId: string) {
  if (error instanceof ApiRouteError) {
    if (error.status >= 500) {
      console.error("API route failed", {
        correlationId,
        code: error.code,
        status: error.status,
        message: error.message,
        details: error.details,
        cause: (error as Error & { cause?: unknown }).cause,
      });
    }
    return;
  }
  console.error("API route failed unexpectedly", {
    correlationId,
    error,
  });
}

export function handleApiRouteError(error: unknown, correlationId: string) {
  logApiRouteError(error, correlationId);
  if (error instanceof ApiRouteError) {
    return apiErrorResponse(error, correlationId);
  }
  return apiErrorResponse(
    new ApiRouteError(
      500,
      "internal_error",
      "The request failed unexpectedly."
    ),
    correlationId
  );
}

export async function parseJsonBody<T>({
  request,
  schema,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
}: {
  request: Request;
  schema: z.ZodType<T>;
  maxBytes?: number;
}) {
  try {
    return await parseBoundedJsonBody(request, maxBytes, schema);
  } catch (error) {
    if (error instanceof HttpRouteError) {
      throw new ApiRouteError(
        error.status,
        error.code,
        error.message,
        error.details
      );
    }
    throw error;
  }
}

export async function requireAuthenticatedRouteContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiRouteError(
      401,
      "authentication_required",
      "Sign in to perform this action."
    );
  }

  return {
    supabase: supabase as ServerSupabaseClient,
    userId: user.id,
  };
}
