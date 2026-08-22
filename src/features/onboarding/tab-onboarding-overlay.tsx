"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type TabOnboardingKey,
  isTabOnboardingCompleted,
  markTabOnboardingCompleted,
} from "@/features/onboarding/tab-onboarding";

interface TabOnboardingOverlayProps {
  onboardingKey: TabOnboardingKey;
  title: string;
  description: string;
  forceOpen?: boolean;
}

export function TabOnboardingOverlay({
  onboardingKey,
  title,
  description,
  forceOpen = false,
}: TabOnboardingOverlayProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    setOpen(!isTabOnboardingCompleted(onboardingKey));
  }, [forceOpen, onboardingKey]);

  if (!open) {
    return null;
  }

  const closeAndPersist = () => {
    markTabOnboardingCompleted(onboardingKey);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[69] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`tab-onboarding-${onboardingKey}`}
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id={`tab-onboarding-${onboardingKey}`}>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeAndPersist}>
              Dismiss
            </Button>
            <Button type="button" onClick={closeAndPersist}>
              Got it
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
