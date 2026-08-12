"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface GoalRouteSheetProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

const SHEET_TOP_OFFSET_VAR = "--goal-sheet-top-offset";
const MOBILE_SHEET_BREAKPOINT_QUERY = "(max-width: 767px)";
const SWIPE_CLOSE_MIN_DELTA_Y = 72;

function getInitialIsMobileViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MOBILE_SHEET_BREAKPOINT_QUERY).matches;
}

function getInitialHeaderBottomOffset() {
  if (typeof document === "undefined") {
    return 0;
  }
  const header = document.querySelector("header");
  if (!header) {
    return 0;
  }
  return Math.max(0, Math.round(header.getBoundingClientRect().bottom));
}

export function GoalRouteSheet({ children, onClose, title }: GoalRouteSheetProps) {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(getInitialIsMobileViewport);
  const [headerBottomOffset, setHeaderBottomOffset] = useState(getInitialHeaderBottomOffset);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_SHEET_BREAKPOINT_QUERY);
    const syncViewportMode = (event: MediaQueryListEvent) =>
      setIsMobileViewport(event.matches);
    mediaQuery.addEventListener("change", syncViewportMode);
    return () => mediaQuery.removeEventListener("change", syncViewportMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const header = document.querySelector("header");
    if (!header) {
      return;
    }

    const syncHeaderOffset = () => {
      const nextOffset = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      setHeaderBottomOffset(nextOffset);
    };

    syncHeaderOffset();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncHeaderOffset)
        : null;
    observer?.observe(header);
    window.addEventListener("resize", syncHeaderOffset);
    window.addEventListener("scroll", syncHeaderOffset, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncHeaderOffset);
      window.removeEventListener("scroll", syncHeaderOffset);
    };
  }, []);

  useEffect(() => {
    const nextOffset = isMobileViewport ? headerBottomOffset : 0;
    document.documentElement.style.setProperty(SHEET_TOP_OFFSET_VAR, `${nextOffset}px`);
    return () => {
      document.documentElement.style.removeProperty(SHEET_TOP_OFFSET_VAR);
    };
  }, [headerBottomOffset, isMobileViewport]);

  const onHeaderTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!isMobileViewport || event.touches.length !== 1) {
        swipeStartRef.current = null;
        return;
      }

      const target = event.target as HTMLElement | null;
      const ignoreSwipe = target?.closest(
        "a,button,input,textarea,select,label,[role='button'],[data-no-swipe='true']"
      );
      if (ignoreSwipe) {
        swipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [isMobileViewport]
  );

  const onHeaderTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const swipeStart = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!isMobileViewport || !swipeStart || event.changedTouches.length === 0) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - swipeStart.x;
      const deltaY = touch.clientY - swipeStart.y;
      if (
        deltaY < SWIPE_CLOSE_MIN_DELTA_Y ||
        Math.abs(deltaY) <= Math.abs(deltaX) ||
        Math.abs(deltaX) > 120
      ) {
        return;
      }

      onClose();
    },
    [isMobileViewport, onClose]
  );

  const mobileConstrainedStyle =
    isMobileViewport && headerBottomOffset > 0
      ? {
          top: `${headerBottomOffset}px`,
          height: `calc(100dvh - ${headerBottomOffset}px)`,
          maxHeight: `calc(100dvh - ${headerBottomOffset}px)`,
        }
      : undefined;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        style={mobileConstrainedStyle}
        className="left-0 right-0 bottom-0 top-auto z-[70] grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 bg-background p-0 ring-0 data-open:slide-in-from-bottom-6 data-open:zoom-in-100 data-closed:slide-out-to-bottom-6 data-closed:zoom-out-100 sm:max-w-none md:left-1/2 md:right-auto md:w-[min(100vw-3rem,64rem)] md:max-w-[64rem] md:-translate-x-1/2 md:top-auto md:h-[88dvh] md:rounded-b-none md:rounded-t-3xl md:border-x md:border-b-0 md:border-t md:shadow-2xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div
          className="sticky top-0 z-10 border-b bg-background/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
          onTouchStart={onHeaderTouchStart}
          onTouchEnd={onHeaderTouchEnd}
        >
          <div className="mb-2 flex justify-center md:hidden">
            <span
              className="h-1 w-12 rounded-full bg-border/80"
              aria-hidden
            />
          </div>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              onClick={onClose}
              aria-label="Close goal editor"
              data-no-swipe="true"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
