// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

import { GET } from "./route";

function buildFromStub() {
  return vi.fn((table: string) => {
    if (table === "xp_profiles") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { track_key: "global", total_xp: 145, current_level: 2 },
                { track_key: "health", total_xp: 80, current_level: 1 },
                { track_key: "career", total_xp: 65, current_level: 1 },
              ],
              error: null,
            }),
        }),
      };
    }
    if (table === "xp_levels") {
      const levels = [
        { level: 1, min_total_xp: 0 },
        { level: 2, min_total_xp: 100 },
        { level: 3, min_total_xp: 250 },
      ];
      return {
        select: () => {
          const byLevel = {
            eq: (_column: string, level: number) => ({
              maybeSingle: () => {
                const row = levels.find((entry) => entry.level === level) ?? null;
                return Promise.resolve({
                  data: row ? { min_total_xp: row.min_total_xp } : null,
                  error: null,
                });
              },
            }),
            gt: (_column: string, level: number) => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data:
                        levels
                          .filter((entry) => entry.level > level)
                          .sort((left, right) => left.level - right.level)[0] ?? null,
                      error: null,
                    }),
                }),
              }),
            }),
          };
          return byLevel;
        },
      };
    }
    if (table === "xp_rewards") {
      return {
        select: () =>
          Promise.resolve({
            data: [
              {
                id: "r2",
                level: 2,
                reward_code: "xp.level.2",
                reward_title: "Level 2",
                reward_description: "Reached level 2",
              },
              {
                id: "r4",
                level: 4,
                reward_code: "xp.level.4",
                reward_title: "Level 4",
                reward_description: "Reached level 4",
              },
            ],
            error: null,
          }),
      };
    }
    if (table === "goal_categories") {
      return {
        select: () =>
          Promise.resolve({
            data: [
              { key: "health", label: "Health", sort_order: 10 },
              { key: "career", label: "Career", sort_order: 20 },
            ],
            error: null,
          }),
      };
    }
    if (table === "user_awards") {
      const chain = {
        eq: () => chain,
        is: () => chain,
        order: () =>
          Promise.resolve({
            data: [
              {
                id: "award-1",
                xp_rewards: {
                  level: 2,
                  reward_code: "xp.level.2",
                  reward_title: "Level 2",
                  reward_description: "Reached level 2",
                },
              },
            ],
            error: null,
          }),
      };
      return {
        select: () => chain,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("GET /api/xp/profile", () => {
  beforeEach(() => {
    vi.stubEnv("XP_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mocks.from.mockImplementation(buildFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 503 when XP is disabled", async () => {
    vi.stubEnv("XP_ENABLED", "false");
    resetEnvCacheForTests();
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "xp_disabled",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("returns global profile, sorted tracks, and pending awards", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      profile: {
        totalXp: 145,
        currentLevel: 2,
        currentLevelMinXp: 100,
        nextLevel: 3,
        nextLevelMinXp: 250,
        xpToNextLevel: 105,
      },
      tracks: [
        { trackKey: "health", label: "Health", totalXp: 80, currentLevel: 1 },
        { trackKey: "career", label: "Career", totalXp: 65, currentLevel: 1 },
      ],
      nextReward: {
        level: 4,
        code: "xp.level.4",
      },
      pendingAwards: [
        {
          awardId: "award-1",
          trackKey: "global",
          level: 2,
        },
      ],
    });
  });
});
