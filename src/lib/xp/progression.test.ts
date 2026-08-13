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

  it("uses the existing early-level thresholds", () => {
    expect(minTotalXpForLevel(1)).toBe(0);
    expect(minTotalXpForLevel(2)).toBe(100);
    expect(minTotalXpForLevel(10)).toBe(3200);
    expect(minTotalXpForLevel(11)).toBe(4000);
    expect(minTotalXpForLevel(12)).toBe(4900);
  });

  it("resolves current and next level from total XP without a SQL table", () => {
    expect(levelForTotalXp(0)).toBe(1);
    expect(levelForTotalXp(99)).toBe(1);
    expect(levelForTotalXp(100)).toBe(2);
    expect(progressionForTotalXp(145)).toEqual({
      currentLevel: 2,
      currentLevelMinXp: 100,
      nextLevel: 3,
      nextLevelMinXp: 250,
      xpToNextLevel: 105,
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
