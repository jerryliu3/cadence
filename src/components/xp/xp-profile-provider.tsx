"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useXpReward } from "@/components/xp/xp-reward-provider";
import { bandForTotalXp, type XpAltitudeBand } from "@/lib/xp/altitude";
import {
  captureViewportRect,
  subscribeXpRefresh,
  type XpRefreshRequestDetail,
} from "@/lib/xp/events";

interface XpProfilePayload {
  profile: {
    totalXp: number;
    currentLevel: number;
    currentLevelMinXp: number;
    nextLevel: number | null;
    nextLevelMinXp: number | null;
    xpToNextLevel: number | null;
  };
  tracks: Array<{
    trackKey: string;
    label: string;
    totalXp: number;
    currentLevel: number;
  }>;
  nextReward: {
    level: number;
    code: string;
    title: string;
    description: string;
  } | null;
  pendingAwards?: Array<{
    awardId: string;
    trackKey: string;
    level: number;
    title: string;
    description: string;
  }>;
}

interface XpProfileContextValue {
  loading: boolean;
  profile: XpProfilePayload["profile"] | null;
  tracks: XpProfilePayload["tracks"];
  nextReward: XpProfilePayload["nextReward"];
  rewardSequence: number;
  band: XpAltitudeBand;
}

const XpProfileContext = createContext<XpProfileContextValue>({
  loading: true,
  profile: null,
  tracks: [],
  nextReward: null,
  rewardSequence: 0,
  band: bandForTotalXp(0),
});

const defaultBand = bandForTotalXp(0);

export function XpProfileProvider({ children }: { children: ReactNode }) {
  const { celebrate } = useXpReward();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<XpProfilePayload["profile"] | null>(null);
  const [tracks, setTracks] = useState<XpProfilePayload["tracks"]>([]);
  const [nextReward, setNextReward] = useState<XpProfilePayload["nextReward"]>(null);
  const [rewardSequence, setRewardSequence] = useState(0);

  const profileRef = useRef<XpProfilePayload["profile"] | null>(null);
  const loadRequestIdRef = useRef(0);
  const displayedAwardIdsRef = useRef(new Set<string>());
  const acknowledgedAwardIdsRef = useRef(new Set<string>());
  const inFlightAwardIdsRef = useRef(new Set<string>());

  const acknowledgeAward = useCallback(async (awardId: string) => {
    try {
      const response = await fetch("/api/xp/awards/acknowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ awardId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const loadProfile = useCallback(
    async (request?: XpRefreshRequestDetail | null) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      try {
        const response = await fetch("/api/xp/profile", {
          method: "GET",
          headers: {
            "Cache-Control": "no-store",
          },
        });
        if (!response.ok) {
          setLoading(false);
          return;
        }

        const payload = (await response.json()) as XpProfilePayload;
        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        const previousProfile = profileRef.current;
        profileRef.current = payload.profile;
        setProfile(payload.profile);
        setTracks(payload.tracks ?? []);
        setNextReward(payload.nextReward ?? null);
        setLoading(false);

        const xpIncreased =
          previousProfile !== null &&
          payload.profile.totalXp > previousProfile.totalXp &&
          request?.desiredFactState === "present";
        if (xpIncreased) {
          const target = document.querySelector("[data-xp-reward-target='true']");
          if (target && request.sourceRect) {
            celebrate({
              sourceRect: request.sourceRect,
              targetRect: captureViewportRect(target),
            });
          }
          setRewardSequence((current) => current + 1);
        }

        for (const award of payload.pendingAwards ?? []) {
          if (
            acknowledgedAwardIdsRef.current.has(award.awardId) ||
            inFlightAwardIdsRef.current.has(award.awardId)
          ) {
            continue;
          }

          const hasBeenDisplayed = displayedAwardIdsRef.current.has(award.awardId);
          if (!hasBeenDisplayed) {
            displayedAwardIdsRef.current.add(award.awardId);
            toast.success(`${award.title}`, {
              description: award.description,
            });
          }

          inFlightAwardIdsRef.current.add(award.awardId);
          const acknowledged = await acknowledgeAward(award.awardId);
          inFlightAwardIdsRef.current.delete(award.awardId);
          if (acknowledged) {
            acknowledgedAwardIdsRef.current.add(award.awardId);
          }
        }
      } catch {
        setLoading(false);
      }
    },
    [acknowledgeAward, celebrate]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProfile]);

  useEffect(() => {
    return subscribeXpRefresh((detail) => {
      void loadProfile(detail ?? null);
    });
  }, [loadProfile]);

  const value = useMemo<XpProfileContextValue>(
    () => ({
      loading,
      profile,
      tracks,
      nextReward,
      rewardSequence,
      band: profile ? bandForTotalXp(profile.totalXp) : defaultBand,
    }),
    [loading, nextReward, profile, rewardSequence, tracks]
  );

  return <XpProfileContext.Provider value={value}>{children}</XpProfileContext.Provider>;
}

export function useXpProfile() {
  return useContext(XpProfileContext);
}
