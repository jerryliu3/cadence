export const MANUAL_COMPLETION_POINTS = 20;
export const CASCADE_MULTIPLIER = 0.25;
export const GOAL_ACHIEVEMENT_POINTS = 100;
export const MAX_LEVEL = 1000;

export interface XpProgression {
  currentLevel: number;
  currentLevelMinXp: number;
  nextLevel: number | null;
  nextLevelMinXp: number | null;
  xpToNextLevel: number | null;
}

export function minTotalXpForLevel(level: number): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  return 50 * clamped * (clamped - 1);
}

export function levelForTotalXp(totalXp: number): number {
  const xp = Math.max(0, Math.trunc(totalXp));
  const discriminant = 1 + (2 * xp) / 25;
  let level = Math.floor((1 + Math.sqrt(Math.max(discriminant, 0))) / 2);
  level = Math.min(MAX_LEVEL, Math.max(1, level));

  while (level > 1 && minTotalXpForLevel(level) > xp) {
    level -= 1;
  }
  while (level < MAX_LEVEL && minTotalXpForLevel(level + 1) <= xp) {
    level += 1;
  }
  return level;
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
    xpToNextLevel: Math.max(nextLevelMinXp - xpAmount(totalXp), 0),
  };
}

function xpAmount(totalXp: number): number {
  return Math.max(0, Math.trunc(totalXp));
}
