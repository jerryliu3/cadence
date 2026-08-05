import { afterEach, describe, expect, it, vi } from "vitest";
import { emitTelemetryEvent } from "./runtime";

describe("telemetry runtime emitter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits validated planner telemetry logs when signing is configured", () => {
    vi.stubEnv(
      "PLANNER_TELEMETRY_HMAC_KEY",
      "test-key-with-at-least-thirty-two-characters-long"
    );
    vi.stubEnv("PLANNER_TELEMETRY_HMAC_KEY_VERSION", "1");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    emitTelemetryEvent({
      eventName: "planner.preview.completed",
      ownerId: "11111111-1111-4111-8111-111111111111",
      correlationId: "00000000-0000-4000-8000-000000000001",
      capabilities: {
        calendarEnabled: true,
        plannerRead: true,
        plannerGeneration: true,
        plannerPlanWrites: true,
        targetedExactCompletion: true,
        coachAi: false,
        overlap: false,
      },
      scope: { month: "2026-08", timezone: "UTC" },
      result: "success",
      statusCode: 200,
      errorCode: null,
      durationMs: 10,
      counts: { eligibleGoals: 1, workUnits: 2 },
      data: {
        source: "manual",
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        boundsBucket: "small",
      },
    });

    expect(infoSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(infoSpy.mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    expect(payload.eventName).toBe("planner.preview.completed");
    expect(payload).not.toHaveProperty("ownerId");
  });

  it("no-ops when telemetry signing key is not configured", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    emitTelemetryEvent({
      eventName: "ai.request.completed",
      ownerId: "11111111-1111-4111-8111-111111111111",
      correlationId: "00000000-0000-4000-8000-000000000001",
      capabilities: {
        calendarEnabled: false,
        plannerRead: false,
        plannerGeneration: false,
        plannerPlanWrites: false,
        targetedExactCompletion: false,
        coachAi: false,
        overlap: false,
      },
      scope: null,
      result: "success",
      statusCode: 200,
      errorCode: null,
      durationMs: 1,
      data: {
        feature: "planner_coach",
        provider: "gemini",
        attempt: 1,
      },
    });
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
