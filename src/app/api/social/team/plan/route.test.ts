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

describe("GET /api/social/team/plan", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    vi.stubEnv("SOCIAL_DUO_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns partner plan entries", async () => {
    const response = await GET(new Request("http://localhost/api/social/team/plan?scopeMonth=2026-08"));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("get_team_partner_plan_service", {
      p_scope_month: "2026-08-01",
    });
  });
});
