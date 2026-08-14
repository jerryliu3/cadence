// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { POST } from "./route";

function buildAdminStub() {
  return vi.fn((table: string) => {
    if (table !== "user_rewards") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: "r1",
                  user_id: "11111111-1111-4111-8111-111111111111",
                  unlocked_at: "2026-08-13T00:00:00.000Z",
                  claimed_at: null,
                },
                error: null,
              }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "r1",
                    claimed_at: "2026-08-14T00:00:00.000Z",
                  },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };
  });
}

describe("POST /api/xp/rewards/[rewardId]/claim", () => {
  beforeEach(() => {
    vi.stubEnv("XP_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.adminFrom.mockImplementation(buildAdminStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("claims unlocked rewards", async () => {
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ rewardId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rewardId: "r1",
      alreadyClaimed: false,
    });
  });
});
