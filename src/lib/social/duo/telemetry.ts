import * as Sentry from "@sentry/nextjs";
import { reportError } from "@/lib/observability/report-error";

export type DuoTelemetrySurface = "insights" | "checklist" | "calendar" | "shell";

function deviceClass(): "mobile" | "desktop" {
  if (typeof window === "undefined") {
    return "desktop";
  }
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

export function reportDuoTelemetry(
  event: string,
  extras: Record<string, unknown> = {}
) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    return;
  }
  const data = {
    deviceClass: deviceClass(),
    ...extras,
  };
  Sentry.addBreadcrumb({
    category: "duo",
    message: event,
    level: "info",
    data,
  });
  const sampleUsageEvent = event === "scope_viewed" && Math.random() >= 0.1;
  if (sampleUsageEvent) {
    return;
  }
  Sentry.captureMessage(`duo.${event}`, {
    level: "info",
    tags: { area: "duo", duoEvent: event },
    extra: data,
  });
}

export function reportDuoPartnerFetchFailure(
  error: unknown,
  extras: {
    surface: DuoTelemetrySurface;
    code?: string;
    status?: number;
    stalePartner?: boolean;
  }
) {
  reportDuoTelemetry("partner_fetch_failed", extras);
  reportError(error, {
    area: "duo",
    ...extras,
  });
}
