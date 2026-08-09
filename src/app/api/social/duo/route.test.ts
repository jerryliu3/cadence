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

describe("GET /api/social/duo", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_DUO_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          duo_id: "11111111-1111-4111-8111-111111111111",
          status: "pending",
          partner_id: "partner-1",
          partner_username: "partner",
          partner_display_name: "Partner",
          partner_avatar_url: null,
          invite_message: null,
          invited_at: "2026-08-10T00:00:00.000Z",
          accepted_at: null,
          is_incoming: true,
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when duo capability is disabled", async () => {
    vi.stubEnv("SOCIAL_DUO_ENABLED", "false");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_duo_disabled",
    });
  });

  it("returns duo state envelope", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      items: [{ status: "pending", isIncoming: true }],
    });
  });
});
