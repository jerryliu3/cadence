"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toLocalDateString } from "@/lib/dates/day";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

export const JOURNEY_INTRO_SEEN_KEY = "cadence.journey_intro_seen.v1";
export const JOURNEY_INTRO_OPEN_EVENT = "cadence.journey_intro.open";

export function requestJourneyIntroOpen() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(JOURNEY_INTRO_OPEN_EVENT));
}

export function JourneyIntroOverlay() {
  const { profile, band } = useXpProfile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const today = toLocalDateString();
      const lastSeen = window.localStorage.getItem(JOURNEY_INTRO_SEEN_KEY);
      if (lastSeen !== today) {
        setOpen(true);
      }
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handleOpenRequest = () => {
      setOpen(true);
    };
    window.addEventListener(JOURNEY_INTRO_OPEN_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener(JOURNEY_INTRO_OPEN_EVENT, handleOpenRequest);
    };
  }, []);

  if (!open) {
    return null;
  }

  const currentLevel = profile?.currentLevel ?? 1;
  const totalXp = profile?.totalXp ?? 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-intro-title"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id="journey-intro-title">Welcome to your climb</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Every check-in moves you upward. Your current camp is{" "}
            <span className="font-medium text-foreground">{band.name}</span>.
          </p>
          <p className="text-muted-foreground">
            Level {currentLevel} · {totalXp} XP
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                window.localStorage.setItem(
                  JOURNEY_INTRO_SEEN_KEY,
                  toLocalDateString()
                );
                setOpen(false);
              }}
            >
              Start journey
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
