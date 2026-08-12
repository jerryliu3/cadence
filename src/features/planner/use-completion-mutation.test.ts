import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";

const mocks = vi.hoisted(() => ({
  executeCompletionDispatch: vi.fn(),
  invalidatePlannerRelatedTabCaches: vi.fn(),
  requestXpRefresh: vi.fn(),
}));

vi.mock("@/lib/planner/completion-dispatch", () => ({
  executeCompletionDispatch: (...args: unknown[]) =>
    mocks.executeCompletionDispatch(...args),
}));

vi.mock("@/lib/cache/planner-tab-cache", () => ({
  invalidatePlannerRelatedTabCaches: () =>
    mocks.invalidatePlannerRelatedTabCaches(),
}));

vi.mock("@/lib/xp/refresh", () => ({
  requestXpRefresh: () => mocks.requestXpRefresh(),
}));

describe("useCompletionMutation", () => {
  beforeEach(() => {
    mocks.executeCompletionDispatch.mockReset();
    mocks.invalidatePlannerRelatedTabCaches.mockReset();
    mocks.requestXpRefresh.mockReset();
  });

  it("invalidates planner-related caches on successful completion writes", async () => {
    mocks.executeCompletionDispatch.mockResolvedValueOnce({
      ok: true,
      message: null,
    });
    const { result } = renderHook(() => useCompletionMutation());

    const response = await result.current({
      decision: {
        allowed: true,
        route: "date_fact",
        exactDateOnly: true,
        reason: "allowed",
      },
      desiredFactState: "present",
      goalId: "goal-1",
      date: "2026-08-12",
      timezone: "UTC",
      fallbackErrorMessage: "fallback",
    });

    expect(response).toEqual({ ok: true, message: null });
    expect(mocks.invalidatePlannerRelatedTabCaches).toHaveBeenCalledTimes(1);
    expect(mocks.requestXpRefresh).toHaveBeenCalledTimes(1);
  });

  it("skips cache invalidation when the mutation does not persist", async () => {
    mocks.executeCompletionDispatch.mockResolvedValueOnce({
      ok: false,
      message: "blocked",
    });
    const { result } = renderHook(() => useCompletionMutation());

    const response = await result.current({
      decision: {
        allowed: true,
        route: "date_fact",
        exactDateOnly: true,
        reason: "allowed",
      },
      desiredFactState: "absent",
      goalId: "goal-2",
      date: "2026-08-12",
      timezone: "UTC",
      fallbackErrorMessage: "fallback",
    });

    expect(response).toEqual({ ok: false, message: "blocked" });
    expect(mocks.invalidatePlannerRelatedTabCaches).toHaveBeenCalledTimes(0);
    expect(mocks.requestXpRefresh).toHaveBeenCalledTimes(0);
  });
});
