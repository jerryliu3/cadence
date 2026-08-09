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

describe("GET /api/social/feed", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_FEED_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "8c000000-0000-4000-8000-000000000001",
          event_type: "xp_earned",
          created_at: "2026-08-09T20:20:00.000Z",
          actor_id: "actor-1",
          actor_username: "actor_one",
          actor_display_name: "Actor One",
          actor_avatar_url: null,
          track_key: "health",
          category_label: "Health",
          goal_title: null,
          xp_delta: 12,
          occurrence_count: 2,
          reaction_count: 0,
          viewer_reacted: false,
          payload: {},
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when social feed is disabled", async () => {
    vi.stubEnv("SOCIAL_FEED_ENABLED", "false");
    const response = await GET(new Request("http://localhost/api/social/feed"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_feed_disabled",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const response = await GET(new Request("http://localhost/api/social/feed"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("returns a feed envelope with no-store cache", async () => {
    const response = await GET(
      new Request("http://localhost/api/social/feed?scope=global&limit=30")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      viewerId: "viewer-1",
      items: [
        {
          id: "8c000000-0000-4000-8000-000000000001",
          eventType: "xp_earned",
          actor: {
            id: "actor-1",
            username: "actor_one",
          },
        },
      ],
    });
  });
});
