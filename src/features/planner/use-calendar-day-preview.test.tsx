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

function dispatchPointerDown(element: HTMLElement) {
  element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
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
      result.current.handleDayCellMouseEnter(day, target);
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
      result.current.handleDayCellPointerDown("touch", day, target);
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
      result.current.handleDayCellMouseEnter(day, target);
      vi.advanceTimersByTime(hoverDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(false);

    act(() => {
      result.current.handleDayCellMouseLeave(day);
      vi.advanceTimersByTime(closeDelayMs);
    });
    expect(result.current.dayPreview).toBeNull();

    act(() => {
      result.current.handleDayCellClick(day, target);
      result.current.handleDayCellMouseLeave(day);
      vi.advanceTimersByTime(closeDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(true);
  });

  it("suppresses hover while pointer is pressed and while drag suppression is active", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.handleDayCellPointerDown("mouse", day, target);
      result.current.handleDayCellMouseEnter(day, target);
      vi.advanceTimersByTime(hoverDelayMs + 5);
    });
    expect(result.current.dayPreview).toBeNull();

    act(() => {
      result.current.handleDayCellPointerEnd();
      result.current.handleDayCellMouseEnter(day, target);
      vi.advanceTimersByTime(hoverDelayMs - 1);
      result.current.suppressHoverForDrag();
      vi.advanceTimersByTime(1);
    });
    expect(result.current.dayPreview).toBeNull();

    act(() => {
      result.current.releaseHoverSuppression();
      result.current.handleDayCellMouseEnter(day, target);
      vi.advanceTimersByTime(hoverDelayMs);
    });
    expect(result.current.dayPreview?.day).toBe(day);
  });

  it("closes pinned previews on outside pointerdown but ignores preview and day-cell clicks", () => {
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
    expect(result.current.dayPreview?.pinned).toBe(true);

    const previewElement = document.createElement("div");
    const previewChild = document.createElement("button");
    previewElement.append(previewChild);
    const dayCellElement = document.createElement("button");
    dayCellElement.setAttribute("data-day-cell", "true");
    const outsideElement = document.createElement("div");
    document.body.append(previewElement, dayCellElement, outsideElement);
    act(() => {
      result.current.dayPreviewRef.current = previewElement;
    });

    act(() => {
      dispatchPointerDown(previewChild);
      dispatchPointerDown(dayCellElement);
    });
    expect(result.current.dayPreview?.pinned).toBe(true);

    act(() => {
      dispatchPointerDown(outsideElement);
    });
    expect(result.current.dayPreview).toBeNull();

    previewElement.remove();
    dayCellElement.remove();
    outsideElement.remove();
  });

  it("keeps unpinned preview open while pointer is inside popup", () => {
    const target = buildCellTarget();
    const { result } = renderHook(() =>
      useCalendarDayPreview({
        hoverDelayMs,
        closeDelayMs,
        longPressDelayMs,
      })
    );

    act(() => {
      result.current.handleDayCellMouseEnter(day, target);
      vi.advanceTimersByTime(hoverDelayMs);
    });
    expect(result.current.dayPreview?.pinned).toBe(false);

    act(() => {
      result.current.handleDayCellMouseLeave(day);
      result.current.handleDayPreviewMouseEnter();
      vi.advanceTimersByTime(closeDelayMs + 1);
    });
    expect(result.current.dayPreview?.day).toBe(day);

    act(() => {
      result.current.handleDayPreviewMouseLeave(day);
      vi.advanceTimersByTime(closeDelayMs + 1);
    });
    expect(result.current.dayPreview).toBeNull();
  });
});
