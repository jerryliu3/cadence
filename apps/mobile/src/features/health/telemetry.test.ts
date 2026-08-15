import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/sentry", () => ({
  isMobileSentryEnabled: () => true,
  addMobileSentryBreadcrumb: vi.fn(),
  captureMobileSentryMessage: vi.fn(),
  captureMobileSentryException: vi.fn(),
}));

import { createMobileHealthTelemetry } from "./telemetry";

function createSink() {
  return {
    isEnabled: vi.fn(() => true),
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  };
}

describe("mobile health telemetry", () => {
  it("records sync success breadcrumbs without raw health values", () => {
    const sink = createSink();
    const telemetry = createMobileHealthTelemetry(sink);
    telemetry.report("sync_succeeded", {
      provider: "apple_healthkit",
      sampleCount: 12,
      autocompleteAppliedCount: 1,
    });
    expect(sink.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "health",
        message: "sync_succeeded",
        data: expect.objectContaining({
          provider: "apple_healthkit",
          sampleCount: 12,
        }),
      })
    );
    const data = sink.addBreadcrumb.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(data)).not.toMatch(/value_numeric|kcal|heart/i);
    expect(sink.captureMessage).not.toHaveBeenCalled();
  });

  it("captures sync failures", () => {
    const sink = createSink();
    const telemetry = createMobileHealthTelemetry(sink);
    const error = new Error("denied");
    telemetry.reportFailure(error, { provider: "android_health_connect" });
    expect(sink.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ area: "health" }),
      })
    );
  });

  it("skips telemetry when sentry is disabled", () => {
    const sink = createSink();
    sink.isEnabled.mockReturnValue(false);
    const telemetry = createMobileHealthTelemetry(sink);
    telemetry.report("disconnect", { provider: "apple_healthkit" });
    expect(sink.addBreadcrumb).not.toHaveBeenCalled();
  });
});
