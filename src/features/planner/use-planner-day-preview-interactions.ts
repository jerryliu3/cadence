"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  DayPreviewState,
  PlannerCalendarViewMode,
} from "@/features/planner/calendar-surface.types";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";

const DAY_PREVIEW_HOVER_DELAY_MS = 1000;
const DAY_PREVIEW_CLOSE_DELAY_MS = 250;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;

interface UsePlannerDayPreviewInteractionsArgs {
  dayPreview: DayPreviewState | null;
  setDayPreview: Dispatch<SetStateAction<DayPreviewState | null>>;
  setExpandedPreviewDay: (day: string | null) => void;
  setMoveDialogDay: (day: string | null) => void;
  setMoveDialogSourceEntryKey: (entryKey: string) => void;
  setSelectedEventEntryKey: (entryKey: string | null) => void;
  setLocalSelectedDay: (day: string | null) => void;
  onSelectedDayChange: (
    day: string | null,
    mode: "push" | "replace",
    nextViewMode?: PlannerCalendarViewMode
  ) => void;
  hoverPreviewTimerRef: MutableRefObject<number | null>;
  hoverPreviewCloseTimerRef: MutableRefObject<number | null>;
  longPressTimerRef: MutableRefObject<number | null>;
  longPressTriggeredRef: MutableRefObject<boolean>;
  pointerPressActiveRef: MutableRefObject<boolean>;
  pointerInsideDayPreviewRef: MutableRefObject<boolean>;
  suppressDayCellClickRef: MutableRefObject<{ day: string; active: boolean } | null>;
  dayPreviewRef: MutableRefObject<HTMLDivElement | null>;
  isDayPreviewSurfaceTarget: (target: Element) => boolean;
}

export function usePlannerDayPreviewInteractions({
  dayPreview,
  setDayPreview,
  setExpandedPreviewDay,
  setMoveDialogDay,
  setMoveDialogSourceEntryKey,
  setSelectedEventEntryKey,
  setLocalSelectedDay,
  onSelectedDayChange,
  hoverPreviewTimerRef,
  hoverPreviewCloseTimerRef,
  longPressTimerRef,
  longPressTriggeredRef,
  pointerPressActiveRef,
  pointerInsideDayPreviewRef,
  suppressDayCellClickRef,
  dayPreviewRef,
  isDayPreviewSurfaceTarget,
}: UsePlannerDayPreviewInteractionsArgs) {
  const clearHoverPreviewTimer = useCallback(() => {
    if (hoverPreviewTimerRef.current) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }
  }, [hoverPreviewTimerRef]);

  const clearHoverPreviewCloseTimer = useCallback(() => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  }, [hoverPreviewCloseTimerRef]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, [longPressTimerRef]);

  const openDayPreview = useCallback(
    ({
      day,
      pinned,
      target,
    }: {
      day: string;
      pinned: boolean;
      target: EventTarget & HTMLElement;
    }) => {
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
    },
    [setDayPreview]
  );

  const openMoveDialogForDay = useCallback(
    (day: string) => {
      setExpandedPreviewDay(null);
      setDayPreview(null);
      setMoveDialogDay(day);
      setMoveDialogSourceEntryKey("");
    },
    [setDayPreview, setExpandedPreviewDay, setMoveDialogDay, setMoveDialogSourceEntryKey]
  );

  const openDayViewForDay = useCallback(
    (day: string) => {
      setExpandedPreviewDay(null);
      setMoveDialogDay(null);
      setSelectedEventEntryKey(null);
      setLocalSelectedDay(day);
      onSelectedDayChange(day, "push", "day");
      setDayPreview(null);
    },
    [
      onSelectedDayChange,
      setDayPreview,
      setExpandedPreviewDay,
      setLocalSelectedDay,
      setMoveDialogDay,
      setSelectedEventEntryKey,
    ]
  );

  const shouldSuppressDayCellClick = useCallback(
    (day: string) => {
      const suppression = suppressDayCellClickRef.current;
      if (!suppression) {
        return false;
      }
      if (suppression.day !== day) {
        return false;
      }
      if (suppression.active) {
        suppressDayCellClickRef.current = null;
        return true;
      }
      return false;
    },
    [suppressDayCellClickRef]
  );

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
      }, DAY_PREVIEW_CLOSE_DELAY_MS);
    },
    [clearHoverPreviewCloseTimer, hoverPreviewCloseTimerRef, pointerInsideDayPreviewRef, setDayPreview]
  );

  const scheduleHoverPreview = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      if (dayPreview?.pinned || pointerPressActiveRef.current) {
        return;
      }
      clearHoverPreviewCloseTimer();
      clearHoverPreviewTimer();
      hoverPreviewTimerRef.current = window.setTimeout(() => {
        if (pointerPressActiveRef.current) {
          return;
        }
        openDayPreview({ day, pinned: false, target });
      }, DAY_PREVIEW_HOVER_DELAY_MS);
    },
    [
      clearHoverPreviewCloseTimer,
      clearHoverPreviewTimer,
      dayPreview?.pinned,
      hoverPreviewTimerRef,
      openDayPreview,
      pointerPressActiveRef,
    ]
  );

  const handleDayCellClick = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      if (shouldSuppressDayCellClick(day)) {
        suppressDayCellClickRef.current = null;
        return;
      }
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
    [
      clearHoverPreviewTimer,
      dayPreview,
      longPressTriggeredRef,
      openDayPreview,
      setDayPreview,
      shouldSuppressDayCellClick,
      suppressDayCellClickRef,
    ]
  );

  const startLongPressPreview = useCallback(
    (day: string, target: EventTarget & HTMLElement) => {
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        openDayPreview({ day, pinned: true, target });
      }, DAY_PREVIEW_LONG_PRESS_DELAY_MS);
    },
    [clearLongPressTimer, longPressTimerRef, longPressTriggeredRef, openDayPreview]
  );

  useEffect(() => {
    if (!dayPreview || dayPreview.pinned) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (isDayPreviewSurfaceTarget(target)) {
        return;
      }
      pointerInsideDayPreviewRef.current = false;
      scheduleHoverPreviewClose(dayPreview.day);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [
    dayPreview,
    isDayPreviewSurfaceTarget,
    pointerInsideDayPreviewRef,
    scheduleHoverPreviewClose,
  ]);

  useOutsidePointerDismiss({
    enabled: Boolean(dayPreview?.pinned),
    containerRef: dayPreviewRef,
    onDismiss: () => {
      setDayPreview(null);
    },
    shouldIgnoreTarget: isDayPreviewSurfaceTarget,
  });

  return {
    clearHoverPreviewTimer,
    clearHoverPreviewCloseTimer,
    clearLongPressTimer,
    openDayPreview,
    openMoveDialogForDay,
    openDayViewForDay,
    scheduleHoverPreviewClose,
    scheduleHoverPreview,
    handleDayCellClick,
    startLongPressPreview,
  };
}
