// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import { GET } from "./route";

describe("GET /api/social/leaderboards", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_LEADERBOARDS_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "aug-open",
          title: "August Open",
          subject_kind: "user",
          metric: "total_xp",
          metric_track_key: null,
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-09-01T00:00:00.000Z",
          status: "open",
          rollover: "monthly",
          closed_at: null,
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when leaderboards are disabled", async () => {
    vi.stubEnv("SOCIAL_LEADERBOARDS_ENABLED", "false");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_leaderboards_disabled",
    });
  });

  it("returns leaderboard season envelope", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      items: [{ slug: "aug-open", metric: "total_xp" }],
    });
  });
});
