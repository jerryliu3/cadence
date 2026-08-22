import { describe, expect, it } from "vitest";
import {
  applySocialTabSearchParams,
  resolveActiveSocialTab,
  resolveSocialOnboardingTab,
} from "@/features/social/social-surface";

describe("social surface URL behavior", () => {
  it("derives onboarding tab from social onboarding key", () => {
    expect(resolveSocialOnboardingTab("social.team")).toBe("team");
    expect(resolveSocialOnboardingTab("planner.checklist")).toBeNull();
    expect(resolveSocialOnboardingTab(null)).toBeNull();
  });

  it("prefers tab query param, then onboarding, then initial tab", () => {
    expect(
      resolveActiveSocialTab({
        initialTab: "challenges",
        tabParam: "leaderboards",
        onboardingParam: "social.team",
      })
    ).toBe("leaderboards");

    expect(
      resolveActiveSocialTab({
        initialTab: undefined,
        tabParam: null,
        onboardingParam: "social.team",
      })
    ).toBe("team");

    expect(
      resolveActiveSocialTab({
        initialTab: "challenges",
        tabParam: null,
        onboardingParam: null,
      })
    ).toBe("challenges");
  });

  it("clears onboarding query param when changing tabs", () => {
    const params = new URLSearchParams("tab=team&onboarding=social.team");
    applySocialTabSearchParams(params, "feed");
    expect(params.get("tab")).toBe("feed");
    expect(params.get("onboarding")).toBeNull();

    const nextParams = new URLSearchParams("onboarding=social.team");
    applySocialTabSearchParams(nextParams, "challenges");
    expect(nextParams.get("tab")).toBe("challenges");
    expect(nextParams.get("onboarding")).toBeNull();
  });
});
