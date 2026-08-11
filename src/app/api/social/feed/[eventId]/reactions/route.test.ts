// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

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

vi.mock("@/lib/push/outbox", () => ({
  flushNotificationOutbox: vi.fn().mockResolvedValue({
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    removedSubscriptions: 0,
  }),
}));

import { POST } from "./route";

describe("POST /api/social/feed/[eventId]/reactions", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 401 for unauthenticated users", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const response = await POST(
      new Request("http://localhost/api/social/feed/event/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: "cheer" }),
      }),
      { params: { eventId: "11111111-1111-4111-8111-111111111111" } }
    );
    expect(response.status).toBe(401);
  });

  it("adds a feed reaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/social/feed/event/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: "cheer" }),
      }),
      { params: { eventId: "11111111-1111-4111-8111-111111111111" } }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_feed_reaction_service", {
      p_feed_event_id: "11111111-1111-4111-8111-111111111111",
      p_reaction: "cheer",
    });
  });
});
