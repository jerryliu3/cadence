import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completionDisabledReasonCopy } from "@/features/planner/calendar-format";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import {
  resolveCompletionControlDisabledReasonForEntry,
  resolveDateFactDispatchForEntry,
} from "@/features/planner/calendar-completion-selectors";
import { toast } from "sonner";
import { postJson } from "@/lib/api/client";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { usePlannerCompletionActions } from "./use-planner-completion-actions";

vi.mock("@/features/planner/calendar-completion-selectors", () => ({
  resolveDateFactDispatchForEntry: vi.fn(),
  resolveCompletionControlDisabledReasonForEntry: vi.fn(),
}));

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

function buildEntry(
  overrides: Partial<PlannerDayDetailEntry> = {}
): PlannerDayDetailEntry {
  return {
    key: "goal-1:unit-1",
    originalGoalId: "goal-1",
    goalTitle: "Goal 1",
    unitKey: "unit-1",
    label: "Session 1",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: {
      id: "item-1",
      plan_goal_id: "plan-goal-1",
      unit_key: "unit-1",
      requirement_kind: "deadline_total",
      scheduled_date: "2026-08-10",
      classification: "planned",
      credit_state: "uncredited",
      locked: false,
      revision: 1,
      credited_completion_id: null,
      credited_completion_date: null,
      scheduled_time_override: null,
      effective_scheduled_local_time: null,
    },
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

describe("usePlannerCompletionActions", () => {
  const resolveDateFactDispatchForEntryMock = vi.mocked(
    resolveDateFactDispatchForEntry
  );
  const resolveCompletionControlDisabledReasonForEntryMock = vi.mocked(
    resolveCompletionControlDisabledReasonForEntry
  );
  const postJsonMock = vi.mocked(postJson);
  const withPlannerRefreshTimeoutMock = vi.mocked(withPlannerRefreshTimeout);
  const toastMock = toast as unknown as {
    (...args: unknown[]): void;
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resolveDateFactDispatchForEntryMock.mockReset();
    resolveCompletionControlDisabledReasonForEntryMock.mockReset();
    postJsonMock.mockReset();
    withPlannerRefreshTimeoutMock.mockClear();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  it("blocks completion updates when disabled reason is present", async () => {
    const dispatchResult: PlannerEntryDateFactDispatch = {
      currentlyCredited: false,
      desiredFactState: "present",
      decision: {
        allowed: true,
        route: "canonical_exact_date",
      } as PlannerEntryDateFactDispatch["decision"],
    };
    resolveDateFactDispatchForEntryMock.mockReturnValue(dispatchResult);
    resolveCompletionControlDisabledReasonForEntryMock.mockReturnValue(
      "future_creation"
    );

    const runCompletionMutation = vi.fn();
    const { result } = renderHook(() =>
      usePlannerCompletionActions({
        context: buildContext(),
        dayDetailDay: "2026-08-10",
        hasDraftSession: false,
        effectiveDraftItemEdits: {},
        effectiveDraftPolicy: null,
        refreshDraftPreview: vi.fn(),
        loadContext: vi.fn(async () => true),
        onPlannerMutation: vi.fn(),
        runCompletionMutation,
      })
    );

    await act(async () => {
      await result.current.toggleDateFact(buildEntry(), "2026-08-10");
    });

    expect(runCompletionMutation).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      completionDisabledReasonCopy("future_creation")
    );
  });

  it("runs completion mutation and refreshes planner context on success", async () => {
    const dispatchResult: PlannerEntryDateFactDispatch = {
      currentlyCredited: false,
      desiredFactState: "present",
      decision: {
        allowed: true,
        route: "canonical_exact_date",
      } as PlannerEntryDateFactDispatch["decision"],
    };
    resolveDateFactDispatchForEntryMock.mockReturnValue(dispatchResult);
    resolveCompletionControlDisabledReasonForEntryMock.mockReturnValue(null);

    const runCompletionMutation = vi.fn(async () => ({ ok: true, message: null }));
    const loadContext = vi.fn(async () => true);
    const onPlannerMutation = vi.fn();
    const entry = buildEntry();

    const { result } = renderHook(() =>
      usePlannerCompletionActions({
        context: buildContext(),
        dayDetailDay: "2026-08-10",
        hasDraftSession: false,
        effectiveDraftItemEdits: {},
        effectiveDraftPolicy: null,
        refreshDraftPreview: vi.fn(),
        loadContext,
        onPlannerMutation,
        runCompletionMutation,
      })
    );

    await act(async () => {
      await result.current.toggleDateFact(entry, "2026-08-10");
    });

    expect(runCompletionMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        desiredFactState: "present",
        goalId: "goal-1",
        date: "2026-08-10",
        timezone: "UTC",
        fallbackErrorMessage: "Planner completion update failed.",
      })
    );
    expect(onPlannerMutation).toHaveBeenCalledTimes(1);
    expect(loadContext).toHaveBeenCalledWith({
      showLoading: false,
      toastOnError: false,
    });
    expect(withPlannerRefreshTimeoutMock).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("Marked done.");
    expect(result.current.mutationLoadingKey).toBeNull();
  });

  it("rejects lock updates when schedule digest is unavailable", async () => {
    const context = buildContext({
      revisions: {
        canonicalRevision: 1,
        executionRevision: 1,
        scheduleDigest: null,
      },
    });

    const { result } = renderHook(() =>
      usePlannerCompletionActions({
        context,
        dayDetailDay: "2026-08-10",
        hasDraftSession: false,
        effectiveDraftItemEdits: {},
        effectiveDraftPolicy: null,
        refreshDraftPreview: vi.fn(),
        loadContext: vi.fn(async () => true),
        onPlannerMutation: vi.fn(),
        runCompletionMutation: vi.fn(async () => ({ ok: true, message: null })),
      })
    );

    await act(async () => {
      await result.current.toggleItemLock(buildEntry());
    });

    expect(postJsonMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(
      "Planner state is stale. Refresh and try again."
    );
  });
});
