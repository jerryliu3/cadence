"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Card } from "@/components/ui/card";
import {
  type ChecklistTabValue,
  ChecklistSurface,
} from "@/features/today/checklist-surface";

export function ChecklistShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const rawTab = searchParams.get("tab");
  const normalizedTab: ChecklistTabValue = useMemo(() => {
    if (rawTab === "not-today" || rawTab === "past") {
      return "not-today";
    }
    return "today";
  }, [rawTab]);

  const applySearchParams = useCallback(
    (
      update: (params: URLSearchParams) => void,
      mode: "push" | "replace",
      state: Record<string, unknown> | null = null
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (nextUrl === currentUrl) {
        return;
      }
      if (mode === "push") {
        window.history.pushState(state, "", nextUrl);
      } else {
        window.history.replaceState(state, "", nextUrl);
      }
    },
    [pathname, searchParams]
  );

  useEffect(() => {
    if (rawTab === null || rawTab === "today" || rawTab === "not-today") {
      return;
    }
    applySearchParams(
      (params) => {
        params.set("tab", normalizedTab);
      },
      "replace"
    );
  }, [applySearchParams, normalizedTab, rawTab]);

  const updateTab = useCallback(
    (tab: ChecklistTabValue, mode: "push" | "replace") => {
      applySearchParams(
        (params) => {
          params.set("tab", tab);
        },
        mode
      );
    },
    [applySearchParams]
  );

  const onTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
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
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || event.changedTouches.length === 0) {
        return;
      }
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return;
      }
      if (deltaX < 0 && normalizedTab === "today") {
        updateTab("not-today", "push");
      } else if (deltaX > 0 && normalizedTab === "not-today") {
        updateTab("today", "push");
      }
    },
    [normalizedTab, updateTab]
  );

  return (
    <div className="space-y-5">
      <Card className="p-3 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {normalizedTab === "today" ? "Today" : "Past"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Swipe left or right to switch surfaces.
        </p>
      </Card>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <ChecklistSurface
          activeTab={normalizedTab}
          onActiveTabChange={(tab) => updateTab(tab, "push")}
          hideTabList
          isActive
        />
      </div>
    </div>
  );
}
