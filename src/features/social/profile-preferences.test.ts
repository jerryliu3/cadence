import { describe, expect, it } from "vitest";
import { buildProfilePreferencesUpdate } from "@/features/social/profile-preferences";

describe("buildProfilePreferencesUpdate", () => {
  it("returns null when nothing changed", () => {
    expect(
      buildProfilePreferencesUpdate({
        plannerPrimaryTabDirty: false,
        socialActivityVisibleDirty: false,
        plannerPrimaryTab: "checklist",
        socialActivityVisible: true,
      })
    ).toBeNull();
  });

  it("returns only the privacy field when only privacy changed", () => {
    expect(
      buildProfilePreferencesUpdate({
        plannerPrimaryTabDirty: false,
        socialActivityVisibleDirty: true,
        plannerPrimaryTab: "calendar",
        socialActivityVisible: false,
      })
    ).toEqual({
      social_activity_visible: false,
    });
  });

  it("returns both fields when planner tab and privacy changed", () => {
    expect(
      buildProfilePreferencesUpdate({
        plannerPrimaryTabDirty: true,
        socialActivityVisibleDirty: true,
        plannerPrimaryTab: "calendar",
        socialActivityVisible: true,
      })
    ).toEqual({
      planner_primary_tab: "calendar",
      social_activity_visible: true,
    });
  });
});
