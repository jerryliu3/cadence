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

import { GET, POST } from "./route";

function buildFromStub() {
  return vi.fn((table: string) => {
    if (table !== "user_rewards") {
      throw new Error(`Unexpected table ${table}`);
    }
    const selectChain = {
      eq: () => ({
        is: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  id: "r1",
                  title: "New bike",
                  note: null,
                  unlock_total_xp: 1000,
                  unlocked_at: null,
                  claimed_at: null,
                  archived_at: null,
                  created_at: "2026-08-14T00:00:00.000Z",
                  updated_at: "2026-08-14T00:00:00.000Z",
                },
              ],
              error: null,
            }),
        }),
      }),
    };

    const insertChain = {
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: "r2",
              title: "New bike",
              note: "After level-up",
              unlock_total_xp: 1200,
              unlocked_at: null,
              claimed_at: null,
              archived_at: null,
              created_at: "2026-08-14T00:00:00.000Z",
              updated_at: "2026-08-14T00:00:00.000Z",
            },
            error: null,
          }),
      }),
    };

    return {
      select: () => selectChain,
      insert: () => insertChain,
    };
  });
}

describe("xp rewards routes", () => {
  beforeEach(() => {
    vi.stubEnv("XP_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.from.mockImplementation(buildFromStub());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetEnvCacheForTests();
  });

  it("lists personal rewards", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rewards: [{ id: "r1", unlockTotalXp: 1000 }],
    });
  });

  it("creates a personal reward", async () => {
    const request = new Request("http://localhost/api/xp/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New bike",
        note: "After level-up",
        unlockTotalXp: 1200,
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      reward: { id: "r2", unlockTotalXp: 1200 },
    });
  });
});
