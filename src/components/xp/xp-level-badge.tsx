"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

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
  const [profile, setProfile] = useState<XpProfileResponse["profile"] | null>(null);
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

  const loadProfile = useCallback(async () => {
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
      setProfile(payload.profile);

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
  }, [acknowledgeAward]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProfile]);

  useEffect(() => {
    const onRefreshRequested = () => {
      void loadProfile();
    };
    window.addEventListener("xp:refresh-requested", onRefreshRequested);
    return () => {
      window.removeEventListener("xp:refresh-requested", onRefreshRequested);
    };
  }, [loadProfile]);

  if (!profile) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant="secondary">{`Lv ${profile.currentLevel} · ${profile.totalXp} XP`}</Badge>
      <p className="text-xs text-muted-foreground">
        {profile.nextLevel !== null && profile.xpToNextLevel !== null
          ? `${profile.xpToNextLevel} XP to Lv ${profile.nextLevel}`
          : "Top level unlocked"}
      </p>
    </div>
  );
}
