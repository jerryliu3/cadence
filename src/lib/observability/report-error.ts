import * as Sentry from "@sentry/nextjs";

type ErrorContext = Record<string, unknown>;

function isReportableStatus(status: unknown) {
  return typeof status !== "number" || status >= 500;
}

/**
 * Capture an unexpected/server failure in Sentry when configured.
 * No-ops when `NEXT_PUBLIC_SENTRY_DSN` is unset (local/CI default).
 */
export function reportError(
  error: unknown,
  context: ErrorContext = {}
): string | undefined {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    return undefined;
  }

  return Sentry.withScope((scope) => {
    const { correlationId, code, status, ...extras } = context;
    if (typeof correlationId === "string" && correlationId.length > 0) {
      scope.setTag("correlationId", correlationId);
      scope.setFingerprint([
        typeof code === "string" ? code : "uncaught",
        correlationId,
      ]);
    }
    if (typeof code === "string" && code.length > 0) {
      scope.setTag("errorCode", code);
    }
    if (typeof status === "number") {
      scope.setTag("httpStatus", String(status));
      if (!isReportableStatus(status)) {
        return undefined;
      }
    }
    if (Object.keys(extras).length > 0) {
      scope.setExtras(extras);
    }
    return Sentry.captureException(error);
  });
}
