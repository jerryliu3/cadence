"use client";

import { useSearchParams } from "next/navigation";
import {
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  type ChecklistTabValue,
  ChecklistSurface,
} from "@/features/today/checklist-surface";
import { DuoLanes, type DuoLaneSubject } from "@/features/social/duo/duo-lanes";
import { useDuoScope } from "@/features/social/duo/duo-context";
import { useClientSearchParamsUpdater } from "@/lib/navigation/use-client-search-params-updater";

export function ChecklistShell() {
  const searchParams = useSearchParams();
  const { applySearchParams } = useClientSearchParamsUpdater();
  const { scope, activePartner } = useDuoScope("me");
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const rawTab = searchParams.get("tab");
  const normalizedTab: ChecklistTabValue = useMemo(() => {
    if (rawTab === "not-today" || rawTab === "past") {
      return "not-today";
    }
    return "today";
  }, [rawTab]);

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

  const viewerLane: DuoLaneSubject = {
    id: "viewer",
    label: "Mine",
    readOnly: false,
  };
  const partnerLane: DuoLaneSubject | null = activePartner
    ? {
        id: "partner",
        label:
          activePartner.partnerDisplayName ??
          activePartner.partnerUsername ??
          "Partner",
        userId: activePartner.partnerId,
        readOnly: true,
        avatarUrl: activePartner.partnerAvatarUrl,
      }
    : null;

  return (
    <div className="space-y-5">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <DuoLanes
          scope={scope}
          viewer={viewerLane}
          partner={partnerLane}
          renderLane={(subject) => (
            <ChecklistSurface
              activeTab={normalizedTab}
              onActiveTabChange={(tab) => updateTab(tab, "push")}
              hideTabList
              isActive
              laneLabel={subject.label}
              subjectUserId={subject.userId}
              readOnly={subject.readOnly}
            />
          )}
        />
      </div>
    </div>
  );
}
