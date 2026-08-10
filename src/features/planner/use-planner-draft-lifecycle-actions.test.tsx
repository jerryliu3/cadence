import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import type { DraftCommandAction } from "@/features/planner/draft-command-reducer";
import { postJson } from "@/lib/api/client";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { usePlannerDraftLifecycleActions } from "./use-planner-draft-lifecycle-actions";

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
    postJson: vi.fn(),
  };
});

vi.mock("@/lib/planner/refresh-timeout", () => ({
  withPlannerRefreshTimeout: vi.fn(
    async ({ operation }: { operation: Promise<boolean> }) => operation
  ),
}));

type PlannerPreview = NonNullable<PlannerContextPayload["preview"]>;

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

function buildPreview(overrides: Partial<PlannerPreview> = {}): PlannerPreview {
  return {
    eligibilityMode: "strict" as PlannerPreview["eligibilityMode"],
    preserveExistingAssignments: false,
    generationInputHash: "preview-hash-1",
    solver: {
      placementStatus: "complete",
      searchStatus: "all_units_placed",
      capacityStatus: "unverified",
      issueCodes: [],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: false,
    },
    workUnits: [],
    ...overrides,
  };
}

describe("usePlannerDraftLifecycleActions", () => {
  const postJsonMock = vi.mocked(postJson);
  const withPlannerRefreshTimeoutMock = vi.mocked(withPlannerRefreshTimeout);
  const toastMock = toast as unknown as {
    (...args: unknown[]): void;
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    postJsonMock.mockReset();
    withPlannerRefreshTimeoutMock.mockClear();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  it("blocks save when schedule digest is missing", async () => {
    const context = buildContext({
      revisions: {
        canonicalRevision: 1,
        executionRevision: 1,
        scheduleDigest: null,
      },
    });
    const clearDraftScopeSession = vi.fn();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();

    const { result } = renderHook(() =>
      usePlannerDraftLifecycleActions({
        context,
        effectivePreview: buildPreview(),
        effectiveDraftPolicy: null,
        draftSaveCommands: [],
        clearDraftScopeSession,
        dispatchDraftCommand,
        loadContext: vi.fn(async () => true),
        onPlannerMutation: vi.fn(),
        onPlannerStateReset: vi.fn(),
        onDraftDiscarded: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.savePlan();
    });

    expect(postJsonMock).not.toHaveBeenCalled();
    expect(clearDraftScopeSession).not.toHaveBeenCalled();
    expect(dispatchDraftCommand).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      "Planner state is stale. Refresh and regenerate the preview."
    );
  });

  it("saves planner draft and refreshes context on success", async () => {
    postJsonMock.mockResolvedValueOnce({ replayed: false } as never);
    const clearDraftScopeSession = vi.fn();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const loadContext = vi.fn(async () => true);
    const onPlannerMutation = vi.fn();
    const onPlannerStateReset = vi.fn();

    const { result } = renderHook(() =>
      usePlannerDraftLifecycleActions({
        context: buildContext(),
        effectivePreview: buildPreview(),
        effectiveDraftPolicy: null,
        draftSaveCommands: [],
        clearDraftScopeSession,
        dispatchDraftCommand,
        loadContext,
        onPlannerMutation,
        onPlannerStateReset,
        onDraftDiscarded: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.savePlan();
    });

    expect(postJsonMock).toHaveBeenCalledWith(
      "/api/planner/save",
      expect.objectContaining({
        expectedDigest: "digest-1",
        scopes: [
          expect.objectContaining({
            scopeMonth: "2026-08",
            previewHash: "preview-hash-1",
          }),
        ],
      })
    );
    expect(clearDraftScopeSession).toHaveBeenCalledWith("2026-08");
    expect(dispatchDraftCommand).toHaveBeenCalledWith({ type: "clear" });
    expect(onPlannerMutation).toHaveBeenCalledTimes(1);
    expect(loadContext).toHaveBeenCalledWith({
      showLoading: false,
      toastOnError: false,
    });
    expect(withPlannerRefreshTimeoutMock).toHaveBeenCalledTimes(1);
    expect(onPlannerStateReset).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("Plan saved.");
    expect(result.current.saveLoading).toBe(false);
  });

  it("resets planner month and clears draft session", async () => {
    postJsonMock.mockResolvedValueOnce({} as never);
    const clearDraftScopeSession = vi.fn();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const loadContext = vi.fn(async () => true);
    const onPlannerMutation = vi.fn();
    const onPlannerStateReset = vi.fn();

    const { result } = renderHook(() =>
      usePlannerDraftLifecycleActions({
        context: buildContext(),
        effectivePreview: buildPreview(),
        effectiveDraftPolicy: null,
        draftSaveCommands: [],
        clearDraftScopeSession,
        dispatchDraftCommand,
        loadContext,
        onPlannerMutation,
        onPlannerStateReset,
        onDraftDiscarded: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.resetPlan();
    });

    expect(postJsonMock).toHaveBeenCalledWith("/api/planner/reset", {
      scopeMonth: "2026-08",
      expectedDigest: "digest-1",
    });
    expect(clearDraftScopeSession).toHaveBeenCalledWith("2026-08");
    expect(dispatchDraftCommand).toHaveBeenCalledWith({ type: "clear" });
    expect(onPlannerMutation).toHaveBeenCalledTimes(1);
    expect(onPlannerStateReset).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("Plan reset.");
    expect(result.current.resetLoading).toBe(false);
  });

  it("discards draft changes and notifies coach state", () => {
    const clearDraftScopeSession = vi.fn();
    const onDraftDiscarded = vi.fn();
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();

    const { result } = renderHook(() =>
      usePlannerDraftLifecycleActions({
        context: buildContext(),
        effectivePreview: buildPreview(),
        effectiveDraftPolicy: null,
        draftSaveCommands: [],
        clearDraftScopeSession,
        dispatchDraftCommand,
        loadContext: vi.fn(async () => true),
        onPlannerMutation: vi.fn(),
        onPlannerStateReset: vi.fn(),
        onDraftDiscarded,
      })
    );

    act(() => {
      result.current.discardDraftChanges();
    });

    expect(clearDraftScopeSession).toHaveBeenCalledWith("2026-08");
    expect(onDraftDiscarded).toHaveBeenCalledTimes(1);
    expect(dispatchDraftCommand).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith(
      "Preview changes reverted to the saved baseline."
    );
  });
});
