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
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.from,
  }),
}));

import { GET } from "./route";

function buildQueryResponse(tableName: string) {
  if (tableName === "leaderboard_standings") {
    return {
      data: [{ refreshed_at: "2026-08-22T15:44:05.000Z" }],
      error: null,
    };
  }
  if (tableName === "challenges") {
    return {
      data: [{ updated_at: "2026-08-22T15:44:20.000Z" }],
      error: null,
    };
  }
  if (tableName === "challenge_participants") {
    return {
      data: [{ progress_at: "2026-08-22T15:44:35.000Z" }],
      error: null,
    };
  }
  throw new Error(`Unexpected table query: ${tableName}`);
}

function buildQueryChain(tableName: string) {
  return {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi
      .fn()
      .mockResolvedValue(buildQueryResponse(tableName)),
  };
}

describe("GET /api/social/freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T15:45:21.000Z"));
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.from.mockImplementation((tableName: string) =>
      buildQueryChain(tableName)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 503 when social is disabled", async () => {
    vi.stubEnv("SOCIAL_ENABLED", "false");
    resetEnvCacheForTests();
    const response = await GET(new Request("http://localhost/api/social/freshness"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_disabled",
    });
  });

  it("returns freshness metadata with no-store cache headers", async () => {
    const response = await GET(new Request("http://localhost/api/social/freshness"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      freshness: {
        serverNow: "2026-08-22T15:45:21.000Z",
        nextExpectedRefreshAt: "2026-08-22T15:46:00.000Z",
        leaderboardRefreshedAt: "2026-08-22T15:44:05.000Z",
        challengesRefreshedAt: "2026-08-22T15:44:35.000Z",
      },
    });
  });
});
