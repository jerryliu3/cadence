import * as Sentry from "@sentry/nextjs";
import type { HealthProvider } from "@cadence/shared/health/providers";

type HealthDiagnosticEvent =
  | "ingest"
  | "disconnect"
  | "autocomplete_rule"
  | "sync_failure";

function sentryConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

export function reportHealthDiagnostic(input: {
  event: HealthDiagnosticEvent;
  correlationId: string;
  provider?: HealthProvider;
  ingestedCount?: number;
  canonicalCount?: number;
  suppressedCount?: number;
  autocompleteAppliedCount?: number;
  deletedCount?: number;
  recomputedDays?: number;
  lastError?: string | null;
}) {
  if (!sentryConfigured()) {
    return;
  }

  const data: Record<string, unknown> = {
    event: input.event,
    correlationId: input.correlationId,
  };
  if (input.provider) {
    data.provider = input.provider;
  }
  if (typeof input.ingestedCount === "number") {
    data.ingestedCount = input.ingestedCount;
  }
  if (typeof input.canonicalCount === "number") {
    data.canonicalCount = input.canonicalCount;
  }
  if (typeof input.suppressedCount === "number") {
    data.suppressedCount = input.suppressedCount;
  }
  if (typeof input.autocompleteAppliedCount === "number") {
    data.autocompleteAppliedCount = input.autocompleteAppliedCount;
  }
  if (typeof input.deletedCount === "number") {
    data.deletedCount = input.deletedCount;
  }
  if (typeof input.recomputedDays === "number") {
    data.recomputedDays = input.recomputedDays;
  }
  if (input.lastError) {
    data.hasLastError = true;
  }

  Sentry.addBreadcrumb({
    category: "health",
    message: input.event,
    level: input.event === "sync_failure" ? "warning" : "info",
    data,
  });

  if (input.event === "sync_failure" || input.event === "disconnect") {
    Sentry.captureMessage(`health.${input.event}`, {
      level: input.event === "sync_failure" ? "warning" : "info",
      tags: {
        area: "health",
        healthEvent: input.event,
        provider: input.provider ?? "unknown",
      },
      extra: data,
    });
  }
}
