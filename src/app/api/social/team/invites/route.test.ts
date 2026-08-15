// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSocialRouteContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/social/api", () => ({
  requireSocialRouteContext: mocks.requireSocialRouteContext,
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

describe("POST /api/social/team/invites", () => {
  beforeEach(() => {
    mocks.requireSocialRouteContext.mockResolvedValue({
      userId: "viewer-1",
      supabase: { rpc: mocks.rpc },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves partner username and sends invite by user id", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "find_profile_by_username") {
        return {
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              username: "partner_user",
              display_name: "Partner",
              avatar_url: null,
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        };
      }
      if (name === "create_team_invite_service") {
        return {
          data: "22222222-2222-4222-8222-222222222222",
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const response = await POST(
      new Request("http://localhost/api/social/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerUsername: " @Partner_User ",
          message: "Let's team",
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("find_profile_by_username", {
      p_query: "partner_user",
      p_limit: 10,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_team_invite_service", {
      p_partner_id: "11111111-1111-4111-8111-111111111111",
      p_message: "Let's team",
    });
  });

  it("returns invalid_partner when username does not resolve", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/social/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerUsername: "missing_user",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_partner",
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("create_team_invite_service", expect.anything());
  });
});
