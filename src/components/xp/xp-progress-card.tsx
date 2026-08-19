"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { bandForTotalXp } from "@/lib/xp/altitude";

interface XpProfileSummary {
  totalXp: number;
  currentLevel: number;
  currentLevelMinXp: number;
  nextLevel: number | null;
  nextLevelMinXp: number | null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function resolveProgressPercent(profile: XpProfileSummary) {
  const currentLevelMin = profile.currentLevelMinXp;
  const nextLevelMin = profile.nextLevelMinXp;
  if (nextLevelMin === null || nextLevelMin <= currentLevelMin) {
    return 100;
  }
  return Math.max(
    0,
    Math.min(
      ((profile.totalXp - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100,
      100
    )
  );
}

function resolveProgressLabel(profile: XpProfileSummary) {
  const currentLevelMin = profile.currentLevelMinXp;
  const nextLevelMin = profile.nextLevelMinXp;
  if (nextLevelMin === null) {
    return "Top level unlocked";
  }
  return `${formatNumber(profile.totalXp - currentLevelMin)} / ${formatNumber(
    nextLevelMin - currentLevelMin
  )} XP to Lv ${profile.nextLevel}`;
}

interface XpProgressCardContentsProps {
  profile: XpProfileSummary;
  rewardSequence?: number;
}

function XpProgressCardContents({
  profile,
  rewardSequence = 0,
}: XpProgressCardContentsProps) {
  const band = bandForTotalXp(profile.totalXp);
  const progressPercent = resolveProgressPercent(profile);
  const progressLabel = resolveProgressLabel(profile);
  const levelProgress = formatNumber(profile.totalXp - profile.currentLevelMinXp);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{band.name}</span>
        <span className="text-xs text-muted-foreground">{`Lv ${profile.currentLevel} · ${levelProgress} XP`}</span>
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
          value={progressPercent}
          className="h-2 bg-muted"
          data-xp-reward-target="true"
        />
      </motion.div>
      <span className="text-[11px] text-muted-foreground">{progressLabel}</span>
    </>
  );
}

interface XpProgressCardProps {
  profile: XpProfileSummary;
  rewardSequence?: number;
  href?: string;
  className?: string;
  ariaLabel?: string;
}

const baseClassName =
  "group flex min-w-[12rem] flex-col gap-1 rounded-lg border border-border/70 bg-background/70 px-3 py-2 transition-colors";

export function XpProgressCard({
  profile,
  rewardSequence = 0,
  href,
  className,
  ariaLabel,
}: XpProgressCardProps) {
  const resolvedClassName = `${baseClassName} ${
    href ? "hover:border-primary/40" : ""
  } ${className ?? ""}`.trim();

  if (href) {
    return (
      <Link href={href} className={resolvedClassName} aria-label={ariaLabel}>
        <XpProgressCardContents profile={profile} rewardSequence={rewardSequence} />
      </Link>
    );
  }

  return (
    <div className={resolvedClassName} aria-label={ariaLabel}>
      <XpProgressCardContents profile={profile} rewardSequence={rewardSequence} />
    </div>
  );
}
