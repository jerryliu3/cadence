import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_TAB_ONBOARDING_KEYS,
  TAB_ONBOARDING_COMPLETED_PREFIX,
  TAB_ONBOARDING_QUERY_PARAM,
  TAB_ONBOARDING_REPLAY_LINKS,
  clearAllTabOnboardingProgress,
  isTabOnboardingCompleted,
  markTabOnboardingCompleted,
} from "@/features/onboarding/tab-onboarding";

describe("tab onboarding utilities", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("marks and reads completion state", () => {
    expect(isTabOnboardingCompleted("planner.checklist")).toBe(false);
    markTabOnboardingCompleted("planner.checklist");
    expect(isTabOnboardingCompleted("planner.checklist")).toBe(true);
  });

  it("clears completion state for every onboarding key", () => {
    for (const key of ALL_TAB_ONBOARDING_KEYS) {
      window.localStorage.setItem(`${TAB_ONBOARDING_COMPLETED_PREFIX}${key}`, "done");
    }

    clearAllTabOnboardingProgress();

    for (const key of ALL_TAB_ONBOARDING_KEYS) {
      expect(window.localStorage.getItem(`${TAB_ONBOARDING_COMPLETED_PREFIX}${key}`)).toBeNull();
    }
  });

  it("provides replay links for each onboarding key", () => {
    expect(TAB_ONBOARDING_REPLAY_LINKS).toHaveLength(ALL_TAB_ONBOARDING_KEYS.length);
    expect(
      TAB_ONBOARDING_REPLAY_LINKS.map((link) => link.key).sort()
    ).toEqual([...ALL_TAB_ONBOARDING_KEYS].sort());
    expect(
      TAB_ONBOARDING_REPLAY_LINKS.every((link) =>
        link.href.includes(`${TAB_ONBOARDING_QUERY_PARAM}=`)
      )
    ).toBe(true);
  });
});
