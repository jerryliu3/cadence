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
  Sentry.addBreadcrumb({
    category: "duo",
    message: event,
    level: "info",
    data: {
      deviceClass: deviceClass(),
      ...extras,
    },
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
