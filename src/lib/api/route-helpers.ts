import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export class ApiRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export function createCorrelationId() {
  return randomUUID();
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

export function handleApiRouteError(error: unknown, correlationId: string) {
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
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiRouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new ApiRouteError(
      413,
      "request_too_large",
      "The request body is too large."
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new ApiRouteError(
      400,
      "invalid_json",
      "Request body must be valid JSON."
    );
  }

  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    throw new ApiRouteError(
      400,
      "validation_failed",
      "Request payload failed validation.",
      { issues: parsed.error.issues }
    );
  }

  return parsed.data;
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
