// XP level progression. Keep in lockstep with
// supabase/migrations/20260813165716_xp_formula_level_progression.sql
// (private.xp_min_total_for_level / private.xp_level_for_total).
//
// Both sides matter: /api/xp/profile reads this module, while award
// grant/revoke in private.refresh_xp_profile reads the SQL functions. The
// vectors in progression.test.ts are mirrored in
// supabase/tests/database/xp_formula_progression.test.sql so a one-sided edit
// to the curve fails on one side or the other.
//
// Point values (manual completion, cascade multiplier, goal achievement) are
// SQL literals in private.xp_manual_completion_points and friends. They are
// deliberately not duplicated here.

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
  const xp = Math.max(0, Math.trunc(totalXp));
  const currentLevel = levelForTotalXp(xp);
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
    xpToNextLevel: Math.max(nextLevelMinXp - xp, 0),
  };
}
