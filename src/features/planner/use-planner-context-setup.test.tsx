import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import { getJson, putJson } from "@/lib/api/client";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { usePlannerContextSetup } from "./use-planner-context-setup";

vi.mock("sonner", () => {
  const mockedToast = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  });
  return { toast: mockedToast };
});

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client"
  );
  return {
    ...actual,
    getJson: vi.fn(),
    putJson: vi.fn(),
  };
});

function buildContext(
  overrides: Partial<PlannerContextPayload> = {}
): PlannerContextPayload {
  return {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-10",
    timezone: "UTC",
    goalTitles: { "goal-1": "Goal 1" },
    preferences: null,
    capabilities: { calendarEnabled: true },
    activePlan: null,
    preview: null,
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
      scheduleDigest: "digest-1",
    },
    staleness: {
      stale: false,
      reasons: [],
    },
    ...overrides,
  };
}

describe("usePlannerContextSetup", () => {
  const getJsonMock = vi.mocked(getJson);
  const putJsonMock = vi.mocked(putJson);
  const toastMock = toast as unknown as {
    (...args: unknown[]): void;
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    getJsonMock.mockReset();
    putJsonMock.mockReset();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  it("redirects to the resolved month when scope month is missing", async () => {
    const onMonthChange = vi.fn();
    const { result } = renderHook(() =>
      usePlannerContextSetup({
        activeTab: "calendar",
        month: null,
        onMonthChange,
        onPlannerMutation: vi.fn(),
        onSetupApplied: vi.fn(),
        autoLoad: false,
      })
    );

    let loaded = false;
    await act(async () => {
      loaded = await result.current.loadContext();
    });

    expect(loaded).toBe(true);
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    const [resolvedMonth, mode] = onMonthChange.mock.calls[0];
    expect(resolvedMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(mode).toBe("replace");
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  it("loads planner context and hydrates setup settings from preferences", async () => {
    const defaultPolicy = createDefaultPlannerPolicy(
      "America/New_York",
      "2026-08-10T00:00:00.000Z"
    );
    defaultPolicy.weekStartsOn = 0;
    defaultPolicy.restWeekdays = [0, 6];
    const payload = buildContext({
      preferences: {
        timezone: "America/New_York",
        timezoneConfirmedAt: "2026-08-09T10:00:00.000Z",
        policyRevision: 2,
        defaultPolicy,
      },
    });
    getJsonMock.mockResolvedValue(payload as never);

    const { result } = renderHook(() =>
      usePlannerContextSetup({
        activeTab: "calendar",
        month: "2026-08",
        onMonthChange: vi.fn(),
        onPlannerMutation: vi.fn(),
        onSetupApplied: vi.fn(),
        autoLoad: false,
      })
    );

    await act(async () => {
      await result.current.loadContext({ showLoading: false });
    });

    expect(getJsonMock).toHaveBeenCalledWith("/api/planner/context", {
      query: { scopeMonth: "2026-08" },
    });
    expect(result.current.context?.scopeMonth).toBe("2026-08");
    expect(result.current.setupTimezone).toBe("America/New_York");
    expect(result.current.setupWeekStartsOn).toBe(0);
    expect(result.current.setupRestWeekdays).toEqual([0, 6]);
  });

  it("rejects invalid setup timezone values", async () => {
    const onPlannerMutation = vi.fn();
    const onSetupApplied = vi.fn();

    const { result } = renderHook(() =>
      usePlannerContextSetup({
        activeTab: "calendar",
        month: "2026-08",
        onMonthChange: vi.fn(),
        onPlannerMutation,
        onSetupApplied,
        autoLoad: false,
      })
    );

    act(() => {
      result.current.setSetupTimezone("Invalid/Timezone");
    });
    await act(async () => {
      await result.current.submitSetup();
    });

    expect(putJsonMock).not.toHaveBeenCalled();
    expect(onPlannerMutation).not.toHaveBeenCalled();
    expect(onSetupApplied).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("Provide a valid IANA timezone.");
  });

  it("saves setup, resets draft-related state, and refreshes context", async () => {
    const onPlannerMutation = vi.fn();
    const onSetupApplied = vi.fn();
    const onMonthChange = vi.fn();
    putJsonMock.mockResolvedValue({} as never);
    getJsonMock.mockResolvedValue(buildContext() as never);

    const { result } = renderHook(() =>
      usePlannerContextSetup({
        activeTab: "calendar",
        month: "2026-08",
        onMonthChange,
        onPlannerMutation,
        onSetupApplied,
        autoLoad: false,
      })
    );

    act(() => {
      result.current.setSetupTimezone("UTC");
      result.current.setSetupWeekStartsOn(1);
      result.current.setSetupRestWeekdays([0, 6]);
    });
    await act(async () => {
      await result.current.submitSetup();
    });

    expect(putJsonMock).toHaveBeenCalledWith(
      "/api/planner/context",
      expect.objectContaining({
        timezone: "UTC",
        defaultPolicy: expect.objectContaining({
          weekStartsOn: 1,
          restWeekdays: [0, 6],
        }),
      })
    );
    expect(onPlannerMutation).toHaveBeenCalledTimes(1);
    expect(onSetupApplied).toHaveBeenCalledTimes(1);
    expect(getJsonMock).toHaveBeenCalledWith("/api/planner/context", {
      query: { scopeMonth: "2026-08" },
    });
    expect(onMonthChange).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Planner setup saved.");
    expect(result.current.setupLoading).toBe(false);
  });
});
