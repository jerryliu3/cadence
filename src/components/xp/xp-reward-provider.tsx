"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
} from "react";
import type { ViewportRectSnapshot } from "@/lib/xp/events";

interface XpRewardFlight {
  sourceRect: ViewportRectSnapshot;
  targetRect: ViewportRectSnapshot;
}

interface XpRewardContextValue {
  celebrate: (flight: XpRewardFlight) => void;
}

const XpRewardContext = createContext<XpRewardContextValue>({
  celebrate: () => undefined,
});

function XpRewardLayer({ children }: { children: ReactNode }) {
  const celebrate = useCallback((_flight: XpRewardFlight) => {
    // Completion still acknowledges rewards via level/state updates, but
    // decorative particle motion is intentionally disabled.
  }, []);

  return (
    <XpRewardContext.Provider value={{ celebrate }}>
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
        data-motion="xp-reward-overlay"
      />
    </XpRewardContext.Provider>
  );
}

export function XpRewardProvider({ children }: { children: ReactNode }) {
  return <XpRewardLayer>{children}</XpRewardLayer>;
}

export function useXpReward() {
  return useContext(XpRewardContext);
}
