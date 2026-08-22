"use client";

import { XpProgressCard } from "@/components/xp/xp-progress-card";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

export function XpProgressBar() {
  const { profile, rewardSequence } = useXpProfile();

  if (!profile) {
    return null;
  }

  return (
    <XpProgressCard
      profile={profile}
      rewardSequence={rewardSequence}
      href="/app/achievements"
      ariaLabel="Open achievements and XP details"
    />
  );
}
