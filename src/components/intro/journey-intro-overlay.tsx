"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

const INTRO_SEEN_KEY = "cadence.journey_intro_seen.v1";

export function JourneyIntroOverlay() {
  const { profile, band } = useXpProfile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const seen = window.localStorage.getItem(INTRO_SEEN_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, []);

  if (!open) {
    return null;
  }

  const currentLevel = profile?.currentLevel ?? 1;
  const totalXp = profile?.totalXp ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome to your climb</CardTitle>
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
                window.localStorage.setItem(INTRO_SEEN_KEY, "true");
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
