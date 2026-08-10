import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarDayPreview } from "./use-calendar-day-preview";

function buildCellTarget() {
  const element = document.createElement("button");
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      top: 100,
      left: 80,
      width: 40,
      height: 24,
      right: 120,
      bottom: 124,
      x: 80,
      y: 100,
      toJSON: () => ({}),
    }),
  });
  return element as EventTarget & HTMLElement;
}

describe("useCalendarDayPreview", () => {
  const day = "2026-08-18";
  const hoverDelayMs = 40;
  const closeDelayMs = 20;
  const longPressDelayMs = 30;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a hover preview after hover delay", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.scheduleHoverPreview(day, target);
      vi.advanceTimersByTime(hoverDelayMs - 1);
    });
    expect(result.current.dayPreview).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.dayPreview?.day).toBe(day);
    expect(result.current.dayPreview?.pinned).toBe(false);
  });

  it("toggles pinned preview on repeated day click", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.handleDayCellClick(day, target);
    });
    expect(result.current.dayPreview?.day).toBe(day);
    expect(result.current.dayPreview?.pinned).toBe(true);

    act(() => {
      result.current.handleDayCellClick(day, target);
    });
    expect(result.current.dayPreview).toBeNull();
  });

  it("suppresses click toggle immediately after long press", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.startLongPressPreview(day, target);
      vi.advanceTimersByTime(longPressDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(true);

    // First click is consumed by the long-press guard.
    act(() => {
      result.current.handleDayCellClick(day, target);
    });
    expect(result.current.dayPreview?.pinned).toBe(true);

    // Second click toggles as normal.
    act(() => {
      result.current.handleDayCellClick(day, target);
    });
    expect(result.current.dayPreview).toBeNull();
  });

  it("closes unpinned previews and keeps pinned previews", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.scheduleHoverPreview(day, target);
      vi.advanceTimersByTime(hoverDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(false);

    act(() => {
      result.current.scheduleHoverPreviewClose(day);
      vi.advanceTimersByTime(closeDelayMs);
    });
    expect(result.current.dayPreview).toBeNull();

    act(() => {
      result.current.handleDayCellClick(day, target);
      result.current.scheduleHoverPreviewClose(day);
      vi.advanceTimersByTime(closeDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(true);
  });
});
