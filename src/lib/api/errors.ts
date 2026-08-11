import {
  ApiRouteError,
  apiErrorResponse,
} from "@/lib/api/route";

export interface RouteErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

export class RouteError extends ApiRouteError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(status, code, message, details);
    this.name = "RouteError";
  }
}

export function routeErrorResponse(error: RouteError, correlationId: string) {
  return apiErrorResponse(error, correlationId);
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
