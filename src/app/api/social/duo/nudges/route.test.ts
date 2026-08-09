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

vi.mock("@/lib/push/outbox", () => ({
  flushNotificationsForUser: vi.fn().mockResolvedValue({
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    removedSubscriptions: 0,
  }),
}));

import { POST } from "./route";

describe("POST /api/social/duo/nudges", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_DUO_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: "nudge-1",
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when duo is disabled", async () => {
    vi.stubEnv("SOCIAL_DUO_ENABLED", "false");
    const response = await POST(
      new Request("http://localhost/api/social/duo/nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: "11111111-1111-4111-8111-111111111111",
          kind: "cheer",
        }),
      })
    );
    expect(response.status).toBe(503);
  });

  it("sends a nudge", async () => {
    const response = await POST(
      new Request("http://localhost/api/social/duo/nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: "11111111-1111-4111-8111-111111111111",
          kind: "cheer",
        }),
      })
    );
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("send_nudge_service", {
      p_to_user_id: "11111111-1111-4111-8111-111111111111",
      p_kind: "cheer",
      p_goal_id: undefined,
      p_message: undefined,
    });
  });
});
