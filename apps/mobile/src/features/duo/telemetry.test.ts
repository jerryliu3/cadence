import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/sentry", () => ({
  isMobileSentryEnabled: () => true,
  addMobileSentryBreadcrumb: vi.fn(),
  captureMobileSentryMessage: vi.fn(),
  captureMobileSentryException: vi.fn(),
}));

import {
  buildMobileDuoScopeTelemetryKey,
  createMobileDuoTelemetry,
  extractMobileDuoPartnerFailureContext,
} from "./telemetry";

function createSink() {
  return {
    isEnabled: vi.fn(() => true),
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  };
}

describe("mobile duo telemetry", () => {
  it("waits for Duo hydration before identifying a viewed scope", () => {
    expect(
      buildMobileDuoScopeTelemetryKey({
        enabled: false,
        surface: "calendar",
        scope: "me",
        hasPartner: false,
      })
    ).toBeNull();
    expect(
      buildMobileDuoScopeTelemetryKey({
        enabled: true,
        surface: "calendar",
        scope: "both",
        hasPartner: true,
      })
    ).toBe("calendar:both:1");
  });

  it("always records breadcrumbs and samples scope_viewed captures", () => {
    const sink = createSink();
    const telemetry = createMobileDuoTelemetry({
      sink,
      random: () => 0.42,
    });

    telemetry.report("scope_viewed", {
      surface: "calendar",
      scope: "both",
      hasPartner: true,
    });

    expect(sink.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "duo",
        message: "scope_viewed",
      })
    );
    expect(sink.captureMessage).not.toHaveBeenCalled();
  });

  it("captures scope_viewed when sample hit is within 10 percent", () => {
    const sink = createSink();
    const telemetry = createMobileDuoTelemetry({
      sink,
      random: () => 0.08,
    });

    telemetry.report("scope_viewed", {
      surface: "checklist",
      scope: "me",
      hasPartner: true,
    });

    expect(sink.captureMessage).toHaveBeenCalledWith(
      "duo.scope_viewed",
      expect.objectContaining({
        tags: expect.objectContaining({
          area: "duo",
          duoEvent: "scope_viewed",
          deviceClass: "mobile",
        }),
      })
    );
  });

  it("captures partner fetch failures with stable tags and sanitized extras", () => {
    const sink = createSink();
    const telemetry = createMobileDuoTelemetry({
      sink,
      random: () => 0,
    });
    const error = new Error("partner fetch failed");

    telemetry.reportPartnerFetchFailure(error, {
      surface: "calendar",
      code: "not_team_partner",
      status: 403,
      stalePartner: true,
    });

    expect(sink.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({
          area: "duo",
          duoEvent: "partner_fetch_failed",
          deviceClass: "mobile",
        }),
        extra: expect.objectContaining({
          surface: "calendar",
          code: "not_team_partner",
          status: 403,
          stalePartner: true,
        }),
      })
    );
    const exceptionInput = vi.mocked(sink.captureException).mock.calls[0]?.[1];
    expect(exceptionInput?.extra).not.toHaveProperty("partnerId");
  });

  it("skips telemetry calls when mobile sentry is disabled", () => {
    const sink = createSink();
    sink.isEnabled.mockReturnValue(false);
    const telemetry = createMobileDuoTelemetry({
      sink,
      random: () => 0,
    });

    telemetry.report("viewer_lane_completion", { surface: "checklist" });
    telemetry.reportPartnerFetchFailure(new Error("boom"), {
      surface: "insights",
      stalePartner: false,
    });

    expect(sink.addBreadcrumb).not.toHaveBeenCalled();
    expect(sink.captureMessage).not.toHaveBeenCalled();
    expect(sink.captureException).not.toHaveBeenCalled();
  });

  it("extracts postgrest error code for non-api failures", () => {
    expect(
      extractMobileDuoPartnerFailureContext({
        code: "PGRST116",
        message: "boom",
      })
    ).toEqual({
      postgrestCode: "PGRST116",
      stalePartner: false,
    });
  });

  it("prefers sanitized postgrestCode on plain errors", () => {
    const error = new Error("Partner completions are unavailable.") as Error & {
      postgrestCode?: string;
      code?: string;
    };
    error.postgrestCode = "PGRST301";
    error.code = "SHOULD_NOT_WIN";
    expect(extractMobileDuoPartnerFailureContext(error)).toEqual({
      postgrestCode: "PGRST301",
      stalePartner: false,
    });
  });
});
