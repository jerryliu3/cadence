"use client";

import { type RefObject, useEffect } from "react";

interface UseOutsidePointerDismissOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  shouldIgnoreTarget?: (target: Element) => boolean;
}

export function useOutsidePointerDismiss({
  enabled,
  containerRef,
  onDismiss,
  shouldIgnoreTarget,
}: UseOutsidePointerDismissOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (containerRef.current?.contains(target)) {
        return;
      }
      if (shouldIgnoreTarget?.(target)) {
        return;
      }
      onDismiss();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef, enabled, onDismiss, shouldIgnoreTarget]);
}
