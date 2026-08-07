// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  levelMaybeSingle: vi.fn(),
  rewardMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const from = vi.fn((table: string) => {
      if (table === "xp_profiles") {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: mocks.profileMaybeSingle,
        };
        return query;
      }

      if (table === "xp_levels") {
        const query = {
          select: vi.fn(() => query),
          gt: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: mocks.levelMaybeSingle,
        };
        return query;
      }

      if (table === "xp_rewards") {
        const query = {
          select: vi.fn(() => query),
          gt: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: mocks.rewardMaybeSingle,
        };
        return query;
      }

      throw new Error(`Unexpected table query: ${table}`);
    });

    return {
      auth: { getUser: mocks.getUser },
      from,
    };
  },
}));

import { GET } from "./route";

describe("xp profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: {
        total_xp: 250,
        current_level: 3,
      },
      error: null,
    });
    mocks.levelMaybeSingle.mockResolvedValue({
      data: {
        level: 4,
        min_total_xp: 450,
      },
      error: null,
    });
    mocks.rewardMaybeSingle.mockResolvedValue({
      data: {
        level: 4,
        reward_title: "Consistency Core",
        reward_description: "You are building consistent momentum.",
      },
      error: null,
    });
  });

  it("returns the authenticated XP profile payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      profile: {
        totalXp: 250,
        currentLevel: 3,
        nextLevel: 4,
        xpToNextLevel: 200,
      },
      nextReward: {
        level: 4,
        title: "Consistency Core",
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("falls back to a zeroed profile when no row exists", async () => {
    mocks.profileMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    mocks.levelMaybeSingle.mockResolvedValueOnce({
      data: {
        level: 2,
        min_total_xp: 100,
      },
      error: null,
    });
    mocks.rewardMaybeSingle.mockResolvedValueOnce({
      data: {
        level: 2,
        reward_title: "Streak Starter",
        reward_description: "You unlocked your first level-up reward.",
      },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      profile: {
        totalXp: 0,
        currentLevel: 1,
        nextLevel: 2,
        xpToNextLevel: 100,
      },
      nextReward: {
        level: 2,
      },
    });
  });
});
