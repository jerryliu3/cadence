import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import {
  initialDraftCommandState,
  type DraftCommandAction,
  type DraftCommandState,
} from "@/features/planner/draft-command-reducer";
import { postJson } from "@/lib/api/client";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { usePlannerDraftPreviewSession } from "./use-planner-draft-preview-session";

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client"
  );
  return {
    ...actual,
    postJson: vi.fn(),
  };
});

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
    workUnits: [
      {
        originalGoalId: "goal-1",
        unitKey: "unit-1",
        label: "Session 1",
        scheduledDate: "2026-08-05",
        classification: "scheduled",
        creditState: "uncredited",
      },
    ],
    ...overrides,
  };
}

describe("usePlannerDraftPreviewSession", () => {
  const postJsonMock = vi.mocked(postJson);

  beforeEach(() => {
    postJsonMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSessionHook({
    context = buildContext(),
    effectivePreview = buildPreview(),
    effectiveDraftPolicy = createDefaultPlannerPolicy(
      "UTC",
      "2026-08-10T00:00:00.000Z"
    ),
    effectiveDraftCommands = [],
    draftCommandState = initialDraftCommandState,
    dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>(),
    setDraftPreviewForScope = vi.fn(),
    draftMovePreviewRefreshDelayMs = 20,
  }: {
    context?: PlannerContextPayload | null;
    effectivePreview?: PlannerPreview | null;
    effectiveDraftPolicy?: ReturnType<typeof createDefaultPlannerPolicy> | null;
    effectiveDraftCommands?: PlannerDraftCommand[];
    draftCommandState?: DraftCommandState;
    dispatchDraftCommand?: (action: DraftCommandAction) => void;
    setDraftPreviewForScope?: (
      scopeMonth: string,
      preview: PlannerPreview | null
    ) => void;
    draftMovePreviewRefreshDelayMs?: number;
  } = {}) {
    const hook = renderHook(() =>
      usePlannerDraftPreviewSession({
        context,
        effectivePreview,
        effectiveDraftPolicy,
        effectiveDraftCommands,
        draftCommandState,
        dispatchDraftCommand,
        setDraftPreviewForScope,
        draftMovePreviewRefreshDelayMs,
      })
    );
    return {
      ...hook,
      dispatchDraftCommand,
      setDraftPreviewForScope,
    };
  }

  it("refreshes stable preview and stores it for the current scope", async () => {
    const refreshedPreview = buildPreview({ generationInputHash: "refreshed-hash" });
    postJsonMock.mockResolvedValueOnce({ preview: refreshedPreview } as never);
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-10T00:00:00.000Z");
    const { result, setDraftPreviewForScope } = renderSessionHook();

    await act(async () => {
      await result.current.refreshDraftPreview(policy);
    });

    expect(postJsonMock).toHaveBeenCalledWith("/api/planner/context", {
      scopeMonth: "2026-08",
      timezone: "UTC",
      policy,
      source: "manual",
      solveIntent: "stable",
      draftCommands: [],
    });
    expect(setDraftPreviewForScope).toHaveBeenCalledWith(
      "2026-08",
      refreshedPreview
    );
  });

  it("applies replan move commands for changed dates", async () => {
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const proposalPreview = buildPreview({
      workUnits: [
        {
          originalGoalId: "goal-1",
          unitKey: "unit-1",
          label: "Session 1",
          scheduledDate: "2026-08-07",
          classification: "scheduled",
          creditState: "uncredited",
        },
      ],
    });
    postJsonMock.mockResolvedValueOnce({ preview: proposalPreview } as never);
    const policy = createDefaultPlannerPolicy("UTC", "2026-08-10T00:00:00.000Z");
    const { result } = renderSessionHook({ dispatchDraftCommand });

    let outcome: { moveCount: number; movedEntryKeys: string[] } = {
      moveCount: 0,
      movedEntryKeys: [],
    };
    await act(async () => {
      outcome = await result.current.applyPolicyReplanMoves(policy);
    });

    expect(postJsonMock).toHaveBeenCalledWith(
      "/api/planner/context",
      expect.objectContaining({
        solveIntent: "replan",
      })
    );
    expect(dispatchDraftCommand).toHaveBeenCalledWith({
      type: "upsert_move",
      scopeMonth: "2026-08",
      goalId: "goal-1",
      unitKey: "unit-1",
      scheduledDate: "2026-08-07",
    });
    expect(outcome).toEqual({
      moveCount: 1,
      movedEntryKeys: ["goal-1:unit-1"],
    });
  });

  it("clears move commands for specified entry keys", () => {
    const dispatchDraftCommand = vi.fn<(action: DraftCommandAction) => void>();
    const { result } = renderSessionHook({ dispatchDraftCommand });

    act(() => {
      result.current.clearDraftMoveCommands(["goal-1:unit-1", "goal-2:unit-2"]);
    });

    expect(dispatchDraftCommand).toHaveBeenNthCalledWith(1, {
      type: "remove_kind",
      scopeMonth: "2026-08",
      kind: "move_item",
      goalId: "goal-1",
      unitKey: "unit-1",
    });
    expect(dispatchDraftCommand).toHaveBeenNthCalledWith(2, {
      type: "remove_kind",
      scopeMonth: "2026-08",
      kind: "move_item",
      goalId: "goal-2",
      unitKey: "unit-2",
    });
  });

  it("debounces scheduled preview refresh calls", async () => {
    postJsonMock.mockResolvedValue({ preview: buildPreview() } as never);
    const { result, setDraftPreviewForScope } = renderSessionHook({
      draftMovePreviewRefreshDelayMs: 25,
    });

    act(() => {
      result.current.scheduleDraftMovePreviewRefresh();
      result.current.scheduleDraftMovePreviewRefresh();
      vi.advanceTimersByTime(24);
    });
    expect(postJsonMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(postJsonMock).toHaveBeenCalledTimes(1);
    expect(setDraftPreviewForScope).toHaveBeenCalledTimes(1);
  });
});
