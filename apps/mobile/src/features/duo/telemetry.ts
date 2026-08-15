import { isApiClientError } from "@cadence/shared/api-client";
import type { DuoScope } from "@cadence/shared/social/duo";
import { useEffect, useRef } from "react";
import {
  addMobileSentryBreadcrumb,
  captureMobileSentryException,
  captureMobileSentryMessage,
  isMobileSentryEnabled,
} from "../../lib/sentry";

export type DuoTelemetrySurface = "insights" | "checklist" | "calendar" | "shell";
export type DuoTelemetryEvent =
  | "scope_viewed"
  | "partner_fetch_failed"
  | "viewer_lane_completion"
  | "partner_strip_open"
  | "post_dissolution_scope_clamp";

interface MobileDuoTelemetrySink {
  isEnabled: () => boolean;
  addBreadcrumb: typeof addMobileSentryBreadcrumb;
  captureMessage: typeof captureMobileSentryMessage;
  captureException: typeof captureMobileSentryException;
}

interface MobileDuoTelemetryOptions {
  sink: MobileDuoTelemetrySink;
  random: () => number;
}

type DuoTelemetryExtras = Record<string, unknown>;

const DUO_TELEMETRY_TAGS = {
  area: "duo",
  deviceClass: "mobile",
} as const;

function sanitizeExtras(extras: DuoTelemetryExtras = {}) {
  const sanitized: DuoTelemetryExtras = {};
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function buildTelemetryTags(event: DuoTelemetryEvent) {
  return {
    ...DUO_TELEMETRY_TAGS,
    duoEvent: event,
  };
}

export function createMobileDuoTelemetry({ sink, random }: MobileDuoTelemetryOptions) {
  const report = (event: DuoTelemetryEvent, extras: DuoTelemetryExtras = {}) => {
    if (!sink.isEnabled()) {
      return;
    }
    const data = {
      ...sanitizeExtras(extras),
      deviceClass: "mobile",
    };
    sink.addBreadcrumb({
      category: "duo",
      message: event,
      level: "info",
      data,
    });

    const sampleUsageEvent = event === "scope_viewed" && random() >= 0.1;
    if (sampleUsageEvent) {
      return;
    }

    sink.captureMessage(`duo.${event}`, {
      level: "info",
      tags: buildTelemetryTags(event),
      extra: data,
    });
  };

  const reportPartnerFetchFailure = (
    error: unknown,
    extras: {
      surface: DuoTelemetrySurface;
      code?: string;
      status?: number;
      postgrestCode?: string;
      stalePartner?: boolean;
    }
  ) => {
    report("partner_fetch_failed", extras);
    if (!sink.isEnabled()) {
      return;
    }
    sink.captureException(error, {
      tags: buildTelemetryTags("partner_fetch_failed"),
      extra: {
        ...sanitizeExtras(extras),
        deviceClass: "mobile",
      },
    });
  };

  return {
    report,
    reportPartnerFetchFailure,
  };
}

const mobileDuoTelemetry = createMobileDuoTelemetry({
  sink: {
    isEnabled: isMobileSentryEnabled,
    addBreadcrumb: addMobileSentryBreadcrumb,
    captureMessage: captureMobileSentryMessage,
    captureException: captureMobileSentryException,
  },
  random: Math.random,
});

export function reportMobileDuoTelemetry(
  event: DuoTelemetryEvent,
  extras: DuoTelemetryExtras = {}
) {
  mobileDuoTelemetry.report(event, extras);
}

export function reportMobileDuoPartnerFetchFailure(
  error: unknown,
  extras: {
    surface: DuoTelemetrySurface;
    code?: string;
    status?: number;
    postgrestCode?: string;
    stalePartner?: boolean;
  }
) {
  mobileDuoTelemetry.reportPartnerFetchFailure(error, extras);
}

export function extractMobileDuoPartnerFailureContext(error: unknown): {
  code?: string;
  status?: number;
  postgrestCode?: string;
  stalePartner: boolean;
} {
  if (isApiClientError(error)) {
    return {
      code: error.code,
      status: error.status,
      stalePartner: error.code === "not_team_partner",
    };
  }
  const postgrestCode =
    error &&
    typeof error === "object" &&
    typeof (error as { postgrestCode?: unknown }).postgrestCode === "string"
      ? (error as { postgrestCode: string }).postgrestCode
      : error &&
          typeof error === "object" &&
          typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
  return {
    postgrestCode,
    stalePartner: false,
  };
}

export function buildMobileDuoScopeTelemetryKey({
  enabled,
  surface,
  scope,
  hasPartner,
}: {
  enabled: boolean;
  surface: DuoTelemetrySurface;
  scope: DuoScope;
  hasPartner: boolean;
}) {
  return enabled
    ? `${surface}:${scope}:${hasPartner ? "1" : "0"}`
    : null;
}

export function useReportMobileDuoScopeViewed({
  enabled = true,
  surface,
  scope,
  hasPartner,
}: {
  enabled?: boolean;
  surface: DuoTelemetrySurface;
  scope: DuoScope;
  hasPartner: boolean;
}) {
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const nextKey = buildMobileDuoScopeTelemetryKey({
      enabled,
      surface,
      scope,
      hasPartner,
    });
    if (!nextKey || lastKey.current === nextKey) {
      return;
    }
    lastKey.current = nextKey;
    reportMobileDuoTelemetry("scope_viewed", {
      surface,
      scope,
      hasPartner,
    });
  }, [enabled, hasPartner, scope, surface]);
}
