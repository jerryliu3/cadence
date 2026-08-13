import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  levelForTotalXp,
  minTotalXpForLevel,
  progressionForTotalXp,
} from "@/lib/xp/progression";

// Mirrored in supabase/tests/database/xp_formula_progression.test.sql. Award
// grant/revoke reads the SQL curve while /api/xp/profile reads the TS one, so
// editing the curve on one side without the other must fail here or there.
const PROGRESSION_VECTORS = {
  minTotalXpForLevel: [
    { level: 1, minTotalXp: 0 },
    { level: 2, minTotalXp: 100 },
    { level: 3, minTotalXp: 300 },
    { level: 10, minTotalXp: 4500 },
    { level: 11, minTotalXp: 5500 },
    { level: 12, minTotalXp: 6600 },
    { level: 1000, minTotalXp: 49_950_000 },
  ],
  levelForTotalXp: [
    { totalXp: 0, level: 1 },
    { totalXp: 99, level: 1 },
    { totalXp: 100, level: 2 },
    { totalXp: 299, level: 2 },
    { totalXp: 300, level: 3 },
    { totalXp: 1000, level: 5 },
    { totalXp: 4500, level: 10 },
    { totalXp: 5500, level: 11 },
    { totalXp: 49_850_100, level: 999 },
    { totalXp: 49_949_999, level: 999 },
    { totalXp: 49_950_000, level: 1000 },
    { totalXp: 99_999_999, level: 1000 },
  ],
} as const;

describe("XP progression", () => {
  it.each(PROGRESSION_VECTORS.minTotalXpForLevel)(
    "level $level starts at $minTotalXp XP",
    ({ level, minTotalXp }) => {
      expect(minTotalXpForLevel(level)).toBe(minTotalXp);
    }
  );

  it.each(PROGRESSION_VECTORS.levelForTotalXp)(
    "$totalXp XP resolves to level $level",
    ({ totalXp, level }) => {
      expect(levelForTotalXp(totalXp)).toBe(level);
    }
  );

  it("uses one quadratic for every level", () => {
    for (let level = 1; level <= 12; level += 1) {
      expect(minTotalXpForLevel(level)).toBe(50 * level * (level - 1));
    }
  });

  it("lands exactly on formula thresholds", () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const threshold = minTotalXpForLevel(level);
      expect(levelForTotalXp(threshold)).toBe(level);
      expect(levelForTotalXp(threshold - 1)).toBe(level - 1);
    }
  });

  it("clamps out-of-range input instead of throwing", () => {
    expect(minTotalXpForLevel(0)).toBe(0);
    expect(minTotalXpForLevel(-5)).toBe(0);
    expect(minTotalXpForLevel(MAX_LEVEL + 50)).toBe(minTotalXpForLevel(MAX_LEVEL));
    expect(levelForTotalXp(-100)).toBe(1);
    expect(levelForTotalXp(12.9)).toBe(1);
  });

  it("resolves current and next level from total XP without a SQL table", () => {
    expect(progressionForTotalXp(145)).toEqual({
      currentLevel: 2,
      currentLevelMinXp: 100,
      nextLevel: 3,
      nextLevelMinXp: 300,
      xpToNextLevel: 155,
    });
  });

  it("caps progression at the configured max level", () => {
    expect(MAX_LEVEL).toBe(1000);
    expect(progressionForTotalXp(minTotalXpForLevel(MAX_LEVEL))).toEqual({
      currentLevel: 1000,
      currentLevelMinXp: 49_950_000,
      nextLevel: null,
      nextLevelMinXp: null,
      xpToNextLevel: null,
    });
  });
});
