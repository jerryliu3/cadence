import type { HealthProvider } from "@cadence/shared/health/providers";
import {
  addMobileSentryBreadcrumb,
  captureMobileSentryException,
  captureMobileSentryMessage,
  isMobileSentryEnabled,
} from "../../lib/sentry";

export type HealthTelemetryEvent = "sync_succeeded" | "sync_failed" | "disconnect";

interface MobileHealthTelemetrySink {
  isEnabled: () => boolean;
  addBreadcrumb: typeof addMobileSentryBreadcrumb;
  captureMessage: typeof captureMobileSentryMessage;
  captureException: typeof captureMobileSentryException;
}

export function createMobileHealthTelemetry(sink: MobileHealthTelemetrySink) {
  const report = (
    event: HealthTelemetryEvent,
    extras: {
      provider: HealthProvider;
      sampleCount?: number;
      autocompleteAppliedCount?: number;
    }
  ) => {
    if (!sink.isEnabled()) {
      return;
    }
    const data = {
      provider: extras.provider,
      sampleCount: extras.sampleCount,
      autocompleteAppliedCount: extras.autocompleteAppliedCount,
      deviceClass: "mobile",
    };
    sink.addBreadcrumb({
      category: "health",
      message: event,
      level: event === "sync_failed" ? "warning" : "info",
      data,
    });
    if (event === "sync_failed") {
      sink.captureMessage(`health.${event}`, {
        level: "warning",
        tags: {
          area: "health",
          healthEvent: event,
          provider: extras.provider,
        },
        extra: data,
      });
    }
  };

  return {
    report,
    reportFailure(error: unknown, extras: { provider: HealthProvider }) {
      report("sync_failed", extras);
      if (!sink.isEnabled()) {
        return;
      }
      sink.captureException(error, {
        tags: {
          area: "health",
          healthEvent: "sync_failed",
          provider: extras.provider,
        },
        extra: {
          provider: extras.provider,
          deviceClass: "mobile",
        },
      });
    },
  };
}

const mobileHealthTelemetry = createMobileHealthTelemetry({
  isEnabled: isMobileSentryEnabled,
  addBreadcrumb: addMobileSentryBreadcrumb,
  captureMessage: captureMobileSentryMessage,
  captureException: captureMobileSentryException,
});

export function reportMobileHealthTelemetry(
  event: HealthTelemetryEvent,
  extras: {
    provider: HealthProvider;
    sampleCount?: number;
    autocompleteAppliedCount?: number;
  }
) {
  mobileHealthTelemetry.report(event, extras);
}

export function reportMobileHealthSyncFailure(
  error: unknown,
  extras: { provider: HealthProvider }
) {
  mobileHealthTelemetry.reportFailure(error, extras);
}
