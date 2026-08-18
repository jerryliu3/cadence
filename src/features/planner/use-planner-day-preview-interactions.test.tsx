import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlannerDayPreviewInteractions } from "@/features/planner/use-planner-day-preview-interactions";

function buildTarget(): EventTarget & HTMLElement {
  const target = document.createElement("button");
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({
      top: 40,
      left: 20,
      width: 120,
      height: 48,
      right: 140,
      bottom: 88,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    }),
  });
  return target as EventTarget & HTMLElement;
}

describe("usePlannerDayPreviewInteractions", () => {
  it("suppresses the next day-cell click after a touch long-press path", () => {
    const setDayPreview = vi.fn();
    const suppressDayCellClickRef = {
      current: { day: "2026-08-16", active: true },
    } as const;

    const { result } = renderHook(() =>
      usePlannerDayPreviewInteractions({
        dayPreview: null,
        setDayPreview,
        setExpandedPreviewDay: vi.fn(),
        setMoveDialogDay: vi.fn(),
        setMoveDialogSourceEntryKey: vi.fn(),
        setSelectedEventEntryKey: vi.fn(),
        setLocalSelectedDay: vi.fn(),
        onSelectedDayChange: vi.fn(),
        hoverPreviewTimerRef: { current: null },
        hoverPreviewCloseTimerRef: { current: null },
        longPressTimerRef: { current: null },
        longPressTriggeredRef: { current: false },
        pointerPressActiveRef: { current: false },
        pointerInsideDayPreviewRef: { current: false },
        lastTouchTapRef: { current: null },
        suppressDayCellClickRef,
        dayPreviewRef: { current: null },
        isDayPreviewSurfaceTarget: () => false,
      })
    );

    act(() => {
      result.current.handleDayCellClick("2026-08-16", buildTarget());
    });

    expect(setDayPreview).not.toHaveBeenCalled();
    expect(suppressDayCellClickRef.current).toBeNull();

    act(() => {
      result.current.handleDayCellClick("2026-08-16", buildTarget());
    });

    expect(setDayPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        day: "2026-08-16",
        pinned: true,
      })
    );
  });
});
