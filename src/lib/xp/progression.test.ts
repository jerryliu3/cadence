import { describe, expect, it } from "vitest";
import {
  CASCADE_MULTIPLIER,
  GOAL_ACHIEVEMENT_POINTS,
  MANUAL_COMPLETION_POINTS,
  MAX_LEVEL,
  levelForTotalXp,
  minTotalXpForLevel,
  progressionForTotalXp,
} from "@/lib/xp/progression";

describe("XP progression", () => {
  it("keeps the shipped point constants in application code", () => {
    expect(MANUAL_COMPLETION_POINTS).toBe(20);
    expect(CASCADE_MULTIPLIER).toBe(0.25);
    expect(GOAL_ACHIEVEMENT_POINTS).toBe(100);
  });

  it("uses one quadratic for every level", () => {
    for (let level = 1; level <= 12; level += 1) {
      expect(minTotalXpForLevel(level)).toBe(50 * level * (level - 1));
    }
    expect(minTotalXpForLevel(1)).toBe(0);
    expect(minTotalXpForLevel(2)).toBe(100);
    expect(minTotalXpForLevel(3)).toBe(300);
    expect(minTotalXpForLevel(10)).toBe(4500);
    expect(minTotalXpForLevel(11)).toBe(5500);
  });

  it("lands exactly on formula thresholds", () => {
    expect(levelForTotalXp(299)).toBe(2);
    expect(levelForTotalXp(300)).toBe(3);
    expect(levelForTotalXp(1000)).toBe(5);
    expect(levelForTotalXp(4500)).toBe(10);
    expect(levelForTotalXp(5500)).toBe(11);
    expect(levelForTotalXp(minTotalXpForLevel(999))).toBe(999);
    expect(levelForTotalXp(minTotalXpForLevel(1000) - 1)).toBe(999);
  });

  it("resolves current and next level from total XP without a SQL table", () => {
    expect(levelForTotalXp(0)).toBe(1);
    expect(levelForTotalXp(99)).toBe(1);
    expect(levelForTotalXp(100)).toBe(2);
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
    expect(levelForTotalXp(99_999_999)).toBe(1000);
    expect(progressionForTotalXp(minTotalXpForLevel(1000))).toMatchObject({
      currentLevel: 1000,
      nextLevel: null,
      nextLevelMinXp: null,
      xpToNextLevel: null,
    });
  });
});
