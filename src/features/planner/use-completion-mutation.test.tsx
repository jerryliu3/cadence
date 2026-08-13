import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import { executeCompletionDispatch } from "@/lib/planner/completion-dispatch";
import { subscribeXpRefresh, type XpRefreshRequestDetail } from "@/lib/xp/events";

vi.mock("@/lib/planner/completion-dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/planner/completion-dispatch")>();
  return {
    ...actual,
    executeCompletionDispatch: vi.fn(),
  };
});

const allowedDecision = {
  route: "canonical_exact_date",
  exactDateOnly: true,
  allowed: true,
  reason: "allowed",
} as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useCompletionMutation", () => {
  it("requests an XP refresh with captured source geometry after success", async () => {
    vi.mocked(executeCompletionDispatch).mockResolvedValue({
      ok: true,
      message: null,
    });
    const refreshDetails: XpRefreshRequestDetail[] = [];
    const unsubscribe = subscribeXpRefresh((detail) => {
      if (detail) {
        refreshDetails.push(detail);
      }
    });
    const { result } = renderHook(() => useCompletionMutation());
    const sourceRect = { top: 12, left: 24, width: 40, height: 40 };

    try {
      await act(async () => {
        await result.current({
          decision: allowedDecision,
          desiredFactState: "present",
          goalId: "goal-1",
          date: "2026-08-10",
          timezone: "America/New_York",
          sourceRect,
          fallbackErrorMessage: "Completion failed.",
        });
      });
    } finally {
      unsubscribe();
    }

    expect(refreshDetails).toEqual([
      {
        reason: "completion",
        desiredFactState: "present",
        sourceRect,
      },
    ]);
  });

  it("does not refresh XP after a failed completion request", async () => {
    vi.mocked(executeCompletionDispatch).mockResolvedValue({
      ok: false,
      message: "Rejected.",
    });
    const onRefresh = vi.fn();
    const unsubscribe = subscribeXpRefresh(onRefresh);
    const { result } = renderHook(() => useCompletionMutation());

    try {
      await act(async () => {
        await result.current({
          decision: allowedDecision,
          desiredFactState: "present",
          goalId: "goal-1",
          date: "2026-08-10",
          timezone: "America/New_York",
          fallbackErrorMessage: "Completion failed.",
        });
      });
    } finally {
      unsubscribe();
    }

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
