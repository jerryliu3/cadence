import { describe, expect, it } from "vitest";
import {
  CATEGORY_CUSTOM_VALUE,
  DEFAULT_GOAL_CATEGORIES,
  getCategorySelectionFromValue,
  getCategoryValueForWrite,
  resolveCategoryKey,
} from "@/lib/goals/category";

describe("goal category helpers", () => {
  it("resolves aliases and keys to catalog keys", () => {
    expect(resolveCategoryKey("fitness", DEFAULT_GOAL_CATEGORIES)).toBe("health");
    expect(resolveCategoryKey("career", DEFAULT_GOAL_CATEGORIES)).toBe("career");
  });

  it("treats unknown labels as custom when category key is other", () => {
    expect(
      getCategorySelectionFromValue("Learning Japanese", DEFAULT_GOAL_CATEGORIES, "other")
    ).toEqual({
      selection: CATEGORY_CUSTOM_VALUE,
      customValue: "Learning Japanese",
    });
  });

  it("returns explicit category keys from selection writes", () => {
    expect(
      getCategoryValueForWrite("health", "ignored", DEFAULT_GOAL_CATEGORIES)
    ).toEqual({
      category: "Health",
      categoryKey: "health",
    });
    expect(
      getCategoryValueForWrite(
        CATEGORY_CUSTOM_VALUE,
        "Deep Work",
        DEFAULT_GOAL_CATEGORIES
      )
    ).toEqual({
      category: "Deep Work",
      categoryKey: "other",
    });
  });
});
