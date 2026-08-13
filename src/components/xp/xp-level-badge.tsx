"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useXpReward } from "@/components/xp/xp-reward-provider";
import {
  captureViewportRect,
  getXpRefreshRequestDetail,
  XP_REFRESH_REQUESTED_EVENT,
  type XpRefreshRequestDetail,
} from "@/lib/xp/events";

interface XpProfileResponse {
  profile: {
    totalXp: number;
    currentLevel: number;
    nextLevel: number | null;
    xpToNextLevel: number | null;
  };
  pendingAwards?: Array<{
    awardId: string;
    level: number;
    title: string;
    description: string;
  }>;
}

export function XpLevelBadge() {
  const { celebrate } = useXpReward();
  const [profile, setProfile] = useState<XpProfileResponse["profile"] | null>(null);
  const [rewardSequence, setRewardSequence] = useState(0);
  const profileRef = useRef<XpProfileResponse["profile"] | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);
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
      // Intentionally swallowed: XP UX should never block rendering flows.
      return false;
    }
  }, []);

  const loadProfile = useCallback(async (request?: XpRefreshRequestDetail | null) => {
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
        return;
      }

      const payload = (await response.json()) as XpProfileResponse;
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      const previousProfile = profileRef.current;
      profileRef.current = payload.profile;
      setProfile(payload.profile);

      const xpIncreased =
        previousProfile !== null &&
        payload.profile.totalXp > previousProfile.totalXp &&
        request?.desiredFactState === "present";
      if (xpIncreased) {
        const target = targetRef.current;
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
      // Intentionally swallowed: XP is supplementary chrome.
    }
  }, [acknowledgeAward, celebrate]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProfile]);

  useEffect(() => {
    const onRefreshRequested = (event: Event) => {
      void loadProfile(getXpRefreshRequestDetail(event));
    };
    window.addEventListener(XP_REFRESH_REQUESTED_EVENT, onRefreshRequested);
    return () => {
      window.removeEventListener(XP_REFRESH_REQUESTED_EVENT, onRefreshRequested);
    };
  }, [loadProfile]);

  if (!profile) {
    return null;
  }

  return (
    <motion.div
      key={rewardSequence}
      ref={targetRef}
      className="flex flex-col items-start gap-1"
      data-motion="xp-level-badge"
      data-xp-reward-target="true"
      aria-live="polite"
      initial={false}
      animate={
        rewardSequence > 0
          ? {
              opacity: [1, 0.72, 1],
              scale: [1, 1.07, 1],
            }
          : { opacity: 1, scale: 1 }
      }
      transition={{
        duration: 0.36,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Badge variant="secondary">{`Lv ${profile.currentLevel} · ${profile.totalXp} XP`}</Badge>
      <p className="text-xs text-muted-foreground">
        {profile.nextLevel !== null && profile.xpToNextLevel !== null
          ? `${profile.xpToNextLevel} XP to Lv ${profile.nextLevel}`
          : "Top level unlocked"}
      </p>
    </motion.div>
  );
}
