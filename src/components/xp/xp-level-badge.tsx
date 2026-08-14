"use client";

import { Badge } from "@/components/ui/badge";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

export function XpLevelBadge() {
  const { profile, loading } = useXpProfile();

  if (loading || !profile) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-1" data-motion="xp-level-badge" aria-live="polite">
      <Badge variant="secondary">{`Lv ${profile.currentLevel} · ${profile.totalXp} XP`}</Badge>
      <p className="text-xs text-muted-foreground">
        {profile.nextLevel !== null && profile.xpToNextLevel !== null
          ? `${profile.xpToNextLevel} XP to Lv ${profile.nextLevel}`
          : "Top level unlocked"}
      </p>
    </div>
  );
}
