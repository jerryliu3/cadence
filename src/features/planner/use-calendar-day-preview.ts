import { useCallback, useEffect, useRef, useState } from "react";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import type { DayPreviewState } from "@/features/planner/calendar-surface.types";

interface OpenDayPreviewInput {
  day: string;
  pinned: boolean;
  target: EventTarget & HTMLElement;
}

interface UseCalendarDayPreviewArgs {
  hoverDelayMs: number;
  closeDelayMs: number;
  longPressDelayMs: number;
}

interface SuppressHoverForDragOptions {
  clearPreview?: boolean;
}

export function useCalendarDayPreview({
  hoverDelayMs,
  closeDelayMs,
  longPressDelayMs,
}: UseCalendarDayPreviewArgs) {
  const [dayPreview, setDayPreview] = useState<DayPreviewState | null>(null);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerPressActiveRef = useRef(false);
  const pointerInsideDayPreviewRef = useRef(false);
  const dayPreviewRef = useRef<HTMLDivElement | null>(null);

  const clearHoverPreviewTimer = useCallback(() => {
    if (hoverPreviewTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }
  }, []);

  const clearHoverPreviewCloseTimer = useCallback(() => {
    if (hoverPreviewCloseTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const cancelHoverPreview = useCallback(() => {
    clearHoverPreviewTimer();
    clearHoverPreviewCloseTimer();
  }, [clearHoverPreviewCloseTimer, clearHoverPreviewTimer]);

  const clearDayPreview = useCallback(() => {
    setDayPreview(null);
  }, []);

  const suppressHoverForDrag = useCallback(
    ({ clearPreview = false }: SuppressHoverForDragOptions = {}) => {
      pointerPressActiveRef.current = true;
      cancelHoverPreview();
      if (clearPreview) {
        setDayPreview(null);
      }
    },
    [cancelHoverPreview]
  );

  const releaseHoverSuppression = useCallback(() => {
    pointerPressActiveRef.current = false;
  }, []);

  const prepareForDayDetailOpen = useCallback(() => {
    cancelHoverPreview();
    setDayPreview(null);
  }, [cancelHoverPreview]);

  const openDayPreview = useCallback(({ day, pinned, target }: OpenDayPreviewInput) => {
    const rect = target.getBoundingClientRect();
    const position = computeDayPreviewPosition({
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setDayPreview({ day, position, pinned });
  }, []);

  const scheduleHoverPreviewClose = useCallback(
    (day: string) => {
      clearHoverPreviewCloseTimer();
      hoverPreviewCloseTimerRef.current = window.setTimeout(() => {
        setDayPreview((current) => {
          if (!current || current.pinned || current.day !== day) {
            return current;
          }
          if (pointerInsideDayPreviewRef.current) {
            return current;
          }
          return null;
        });
      }, closeDelayMs);
    },
    [clearHoverPreviewCloseTimer, closeDelayMs]
  );

  const handleDayCellMouseEnter = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      if (dayPreview?.pinned || pointerPressActiveRef.current) {
        return;
      }
      cancelHoverPreview();
      hoverPreviewTimerRef.current = window.setTimeout(() => {
        if (pointerPressActiveRef.current) {
          return;
        }
        openDayPreview({ day, pinned: false, target });
      }, hoverDelayMs);
    },
    [cancelHoverPreview, dayPreview?.pinned, hoverDelayMs, openDayPreview]
  );

  const handleDayCellMouseLeave = useCallback(
    (day: string) => {
      clearHoverPreviewTimer();
      scheduleHoverPreviewClose(day);
    },
    [clearHoverPreviewTimer, scheduleHoverPreviewClose]
  );

  const handleDayCellClick = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (dayPreview?.pinned && dayPreview.day === day) {
        setDayPreview(null);
        return;
      }
      clearHoverPreviewTimer();
      openDayPreview({ day, pinned: true, target });
    },
    [clearHoverPreviewTimer, dayPreview, openDayPreview]
  );

  const startLongPressPreview = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        openDayPreview({ day, pinned: true, target });
      }, longPressDelayMs);
    },
    [clearLongPressTimer, longPressDelayMs, openDayPreview]
  );

  const handleDayCellPointerDown = useCallback(
    (
      pointerType: string,
      day: string,
      target: EventTarget & HTMLElement
    ) => {
      pointerPressActiveRef.current = true;
      clearHoverPreviewTimer();
      if (pointerType === "touch") {
        startLongPressPreview(day, target);
      }
    },
    [clearHoverPreviewTimer, startLongPressPreview]
  );

  const handleDayCellPointerEnd = useCallback(() => {
    pointerPressActiveRef.current = false;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleDayCellPointerLeave = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const pinDayPreview = useCallback(() => {
    setDayPreview((current) =>
      current && !current.pinned ? { ...current, pinned: true } : current
    );
  }, []);

  const handleDayPreviewMouseEnter = useCallback(() => {
    pointerInsideDayPreviewRef.current = true;
    cancelHoverPreview();
  }, [cancelHoverPreview]);

  const handleDayPreviewMouseLeave = useCallback(
    (day: string) => {
      pointerInsideDayPreviewRef.current = false;
      scheduleHoverPreviewClose(day);
    },
    [scheduleHoverPreviewClose]
  );

  useEffect(
    () => () => {
      if (hoverPreviewTimerRef.current !== null) {
        window.clearTimeout(hoverPreviewTimerRef.current);
      }
      if (hoverPreviewCloseTimerRef.current !== null) {
        window.clearTimeout(hoverPreviewCloseTimerRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const clearPointerPress = () => {
      pointerPressActiveRef.current = false;
    };
    window.addEventListener("pointerup", clearPointerPress);
    window.addEventListener("pointercancel", clearPointerPress);
    window.addEventListener("blur", clearPointerPress);
    return () => {
      window.removeEventListener("pointerup", clearPointerPress);
      window.removeEventListener("pointercancel", clearPointerPress);
      window.removeEventListener("blur", clearPointerPress);
    };
  }, []);

  useEffect(() => {
    if (!dayPreview?.pinned) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (dayPreviewRef.current?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest('[data-day-cell="true"]')
      ) {
        return;
      }
      setDayPreview(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [dayPreview?.pinned]);

  return {
    dayPreview,
    dayPreviewRef,
    clearDayPreview,
    prepareForDayDetailOpen,
    pinDayPreview,
    suppressHoverForDrag,
    releaseHoverSuppression,
    handleDayCellClick,
    handleDayCellMouseEnter,
    handleDayCellMouseLeave,
    handleDayCellPointerDown,
    handleDayCellPointerEnd,
    handleDayCellPointerLeave,
    handleDayPreviewMouseEnter,
    handleDayPreviewMouseLeave,
  };
}
