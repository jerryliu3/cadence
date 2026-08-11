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

describe("POST /api/social/team/nudges", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
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
    resetEnvCacheForTests();
  });

  it("returns 503 when social is disabled", async () => {
    vi.stubEnv("SOCIAL_ENABLED", "false");
    resetEnvCacheForTests();
    const response = await POST(
      new Request("http://localhost/api/social/team/nudges", {
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
      new Request("http://localhost/api/social/team/nudges", {
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
