import { describe, expect, it } from "vitest";
import { resolveSocialSurfaceTab } from "@/features/social/social-surface-tab";

describe("resolveSocialSurfaceTab", () => {
  it("opens the team tab from the profile deep link", () => {
    expect(resolveSocialSurfaceTab("team")).toBe("team");
  });

  it("falls back to feed for unknown tabs", () => {
    expect(resolveSocialSurfaceTab(undefined)).toBe("feed");
    expect(resolveSocialSurfaceTab("unknown")).toBe("feed");
  });
});
