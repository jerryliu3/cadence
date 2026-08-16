"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toLocalDateString } from "@/lib/dates/day";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

export const JOURNEY_INTRO_SEEN_KEY = "cadence.journey_intro_seen.v1";
export const JOURNEY_ONBOARDING_COMPLETED_KEY =
  "cadence.journey_onboarding_completed.v1";
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
  const [stepIndex, setStepIndex] = useState(0);

  const currentLevel = profile?.currentLevel ?? 1;
  const totalXp = profile?.totalXp ?? 0;

  const steps = [
    {
      title: "Welcome to your climb",
      body: (
        <>
          <p className="text-muted-foreground">
            Every check-in moves you upward. Your current camp is{" "}
            <span className="font-medium text-foreground">{band.name}</span>.
          </p>
          <p className="text-muted-foreground">
            Level {currentLevel} · {totalXp} XP
          </p>
        </>
      ),
    },
    {
      title: "Plan your week",
      body: (
        <>
          <p className="text-muted-foreground">
            Use Calendar to place sessions and lock must-do days before the week starts.
          </p>
          <p className="text-muted-foreground">
            Checklist stays focused on what matters today so execution is simple.
          </p>
        </>
      ),
    },
    {
      title: "Capture one-off tasks",
      body: (
        <>
          <p className="text-muted-foreground">
            The new To-Do tab tracks ad-hoc work that should not become long-lived goals.
          </p>
          <p className="text-muted-foreground">
            Completed tasks remain visible through today, then clear automatically tomorrow.
          </p>
        </>
      ),
    },
    {
      title: "Stay connected",
      body: (
        <>
          <p className="text-muted-foreground">
            Use Challenges to coordinate with your partner and keep momentum together.
          </p>
          <p className="text-muted-foreground">
            You can replay this onboarding anytime from Profile settings.
          </p>
        </>
      ),
    },
  ] as const;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const completed = window.localStorage.getItem(JOURNEY_ONBOARDING_COMPLETED_KEY);
      const lastSeen = window.localStorage.getItem(JOURNEY_INTRO_SEEN_KEY);
      if (completed !== "done" && lastSeen === null) {
        setOpen(true);
      }
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handleOpenRequest = () => {
      setStepIndex(0);
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

  const step = steps[stepIndex];
  const isLastStep = stepIndex >= steps.length - 1;

  const closeAndPersist = () => {
    window.localStorage.setItem(JOURNEY_ONBOARDING_COMPLETED_KEY, "done");
    window.localStorage.setItem(JOURNEY_INTRO_SEEN_KEY, toLocalDateString());
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-intro-title"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id="journey-intro-title">{step.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Step {stepIndex + 1} of {steps.length}
          </p>
          {step.body}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={closeAndPersist}
            >
              Skip onboarding
            </Button>
            <div className="flex gap-2">
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                >
                  Back
                </Button>
              ) : null}
              <Button
                type="button"
              onClick={() => {
                if (isLastStep) {
                  closeAndPersist();
                  return;
                }
                setStepIndex((current) => Math.min(steps.length - 1, current + 1));
              }}
            >
              {isLastStep ? "Start journey" : "Next"}
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
