import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getJson: mocks.getJson,
  },
}));

import { fetchMobilePublicProfile } from "./public-profile";

describe("fetchMobilePublicProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the bundled profile endpoint and returns item payload", async () => {
    mocks.getJson.mockResolvedValue({
      schemaVersion: "1",
      correlationId: "corr-1",
      item: {
        schemaVersion: "1",
        profile: {
          subjectUserId: "11111111-1111-4111-8111-111111111111",
          username: "alex",
          displayName: "Alex",
          avatarUrl: null,
          isPrivate: false,
        },
        xp: null,
        globalAchievements: [],
        overallStats: null,
        yearHeatmap: [],
      },
    });

    const result = await fetchMobilePublicProfile({
      subjectUserId: "11111111-1111-4111-8111-111111111111",
      year: 2026,
    });

    expect(result.profile.subjectUserId).toBe("11111111-1111-4111-8111-111111111111");
    expect(mocks.getJson).toHaveBeenCalledWith(
      "/api/social/profiles/11111111-1111-4111-8111-111111111111",
      {
        query: { year: "2026" },
      }
    );
  });
});
