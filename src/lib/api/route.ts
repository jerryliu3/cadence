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
      ...payload,
      correlationId,
    },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

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

export async function requireAuthenticatedRouteContext({
  supabase,
  unauthorizedMessage = "Sign in to perform this action.",
}: {
  supabase: ServerSupabaseClient;
  unauthorizedMessage?: string;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiRouteError(
      401,
      "authentication_required",
      unauthorizedMessage
    );
  }

  return {
    supabase,
    userId: user.id,
  };
}

export async function withRoute(
  handler: (context: { correlationId: string }) => Promise<NextResponse>,
  {
    onError = handleApiRouteError,
  }: {
    onError?: (error: unknown, correlationId: string) => NextResponse;
  } = {}
) {
  const correlationId = createCorrelationId();
  try {
    return await handler({ correlationId });
  } catch (error) {
    return onError(error, correlationId);
  }
}
