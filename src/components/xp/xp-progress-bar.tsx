"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function XpProgressBar() {
  const { profile, rewardSequence, band } = useXpProfile();

  if (!profile) {
    return null;
  }

  const currentLevelMin = profile.currentLevelMinXp;
  const nextLevelMin = profile.nextLevelMinXp;
  const percent =
    nextLevelMin === null || nextLevelMin <= currentLevelMin
      ? 100
      : Math.max(
          0,
          Math.min(
            ((profile.totalXp - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100,
            100
          )
        );

  const progressLabel =
    nextLevelMin === null
      ? "Top level unlocked"
      : `${formatNumber(profile.totalXp)} / ${formatNumber(nextLevelMin)} XP`;

  return (
    <Link
      href="/achievements"
      className="group flex min-w-[12rem] flex-col gap-1 rounded-lg border border-border/70 bg-background/70 px-3 py-2 transition-colors hover:border-primary/40"
      aria-label="Open achievements and XP details"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{band.name}</span>
        <span className="text-xs text-muted-foreground">{`Lv ${profile.currentLevel}`}</span>
      </div>
      <motion.div
        key={rewardSequence}
        initial={false}
        animate={
          rewardSequence > 0
            ? {
                opacity: [1, 0.82, 1],
                scale: [1, 1.02, 1],
              }
            : { opacity: 1, scale: 1 }
        }
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Progress
          value={percent}
          className="h-2 bg-muted"
          data-xp-reward-target="true"
        />
      </motion.div>
      <span className="text-[11px] text-muted-foreground">{progressLabel}</span>
    </Link>
  );
}
