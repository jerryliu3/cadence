export const MANUAL_COMPLETION_POINTS = 20;
export const CASCADE_MULTIPLIER = 0.25;
export const GOAL_ACHIEVEMENT_POINTS = 100;
export const MAX_LEVEL = 1000;

const EARLY_MIN_TOTAL_XP = [0, 0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200] as const;

export interface XpProgression {
  currentLevel: number;
  currentLevelMinXp: number;
  nextLevel: number | null;
  nextLevelMinXp: number | null;
  xpToNextLevel: number | null;
}

export function minTotalXpForLevel(level: number): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  if (clamped <= 10) {
    return EARLY_MIN_TOTAL_XP[clamped];
  }
  if (clamped === 11) {
    return 4000;
  }
  const lastTerm = clamped - 3;
  return 4000 + 100 * ((lastTerm * (lastTerm + 1)) / 2 - 36);
}

export function levelForTotalXp(totalXp: number): number {
  const xp = Math.max(0, Math.trunc(totalXp));
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (minTotalXpForLevel(mid) <= xp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

export function progressionForTotalXp(totalXp: number): XpProgression {
  const currentLevel = levelForTotalXp(totalXp);
  const currentLevelMinXp = minTotalXpForLevel(currentLevel);
  if (currentLevel >= MAX_LEVEL) {
    return {
      currentLevel,
      currentLevelMinXp,
      nextLevel: null,
      nextLevelMinXp: null,
      xpToNextLevel: null,
    };
  }
  const nextLevel = currentLevel + 1;
  const nextLevelMinXp = minTotalXpForLevel(nextLevel);
  return {
    currentLevel,
    currentLevelMinXp,
    nextLevel,
    nextLevelMinXp,
    xpToNextLevel: Math.max(nextLevelMinXp - Math.max(0, Math.trunc(totalXp)), 0),
  };
}
