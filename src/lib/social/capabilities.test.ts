import { afterEach, describe, expect, it, vi } from "vitest";
import { getSocialCapabilities } from "@/lib/social/capabilities";

describe("getSocialCapabilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults all social capabilities to false", () => {
    const capabilities = getSocialCapabilities();
    expect(capabilities).toEqual({
      socialEnabled: false,
      socialFeedEnabled: false,
      socialChallengesEnabled: false,
      socialLeaderboardsEnabled: false,
      socialDuoEnabled: false,
    });
  });

  it("parses explicit true and false values", () => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_FEED_ENABLED", "false");
    vi.stubEnv("SOCIAL_CHALLENGES_ENABLED", "true");
    vi.stubEnv("SOCIAL_LEADERBOARDS_ENABLED", "true");
    vi.stubEnv("SOCIAL_DUO_ENABLED", "false");

    const capabilities = getSocialCapabilities();
    expect(capabilities).toEqual({
      socialEnabled: true,
      socialFeedEnabled: false,
      socialChallengesEnabled: true,
      socialLeaderboardsEnabled: true,
      socialDuoEnabled: false,
    });
  });
});
