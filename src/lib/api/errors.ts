import { NextResponse } from "next/server";

export interface RouteErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export function routeErrorResponse(error: RouteError, correlationId: string) {
  const payload: RouteErrorBody = {
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

export function unknownRouteErrorResponse({
  correlationId,
  message = "Request failed unexpectedly.",
  code = "internal_error",
}: {
  correlationId: string;
  message?: string;
  code?: string;
}) {
  return routeErrorResponse(new RouteError(500, code, message), correlationId);
}
