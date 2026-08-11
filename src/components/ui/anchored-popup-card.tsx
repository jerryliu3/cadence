"use client";

import type { ReactNode } from "react";
import type { MouseEventHandler, PointerEventHandler, RefObject } from "react";
import { cn } from "@/lib/utils";

export interface AnchoredPopupPosition {
  top: number;
  left: number;
  width: number;
  placement?: "above" | "below";
}

interface AnchoredPopupCardProps {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  popupRef?: RefObject<HTMLDivElement | null>;
  position?: AnchoredPopupPosition | null;
  fallbackTop?: number;
  fallbackLeft?: number;
  fallbackWidth?: number;
  className?: string;
  bodyClassName?: string;
  dataNoSwipe?: boolean;
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
}

export function AnchoredPopupCard({
  title,
  actions,
  children,
  popupRef,
  position,
  fallbackTop = 16,
  fallbackLeft = 16,
  fallbackWidth = 320,
  className,
  bodyClassName,
  dataNoSwipe = true,
  onPointerDownCapture,
  onMouseEnter,
  onMouseLeave,
}: AnchoredPopupCardProps) {
  return (
    <div
      ref={popupRef}
      className={cn("fixed z-40 rounded-md border bg-card p-3 shadow-lg", className)}
      style={{
        top: position?.top ?? fallbackTop,
        left: position?.left ?? fallbackLeft,
        width: position?.width ?? fallbackWidth,
        transform: position?.placement === "above" ? "translateY(-100%)" : undefined,
      }}
      data-no-swipe={dataNoSwipe ? "true" : undefined}
      onPointerDownCapture={onPointerDownCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
