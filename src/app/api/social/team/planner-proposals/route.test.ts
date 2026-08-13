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
  flushNotificationOutbox: vi.fn().mockResolvedValue({
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    removedSubscriptions: 0,
  }),
}));

import { GET, POST } from "./route";

describe("social team planner proposals route", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
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

  it("lists planner proposals", async () => {
    const response = await GET(
      new Request("http://localhost/api/social/team/planner-proposals?scopeMonth=2026-08")
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("get_planner_proposals_service", {
      p_scope_month: "2026-08-01",
    });
  });

  it("creates planner proposal", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: "proposal-1",
      error: null,
    });
    const response = await POST(
      new Request("http://localhost/api/social/team/planner-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetOwnerId: "11111111-1111-4111-8111-111111111111",
          scopeMonth: "2026-08",
          operations: [{ op: "clear_month" }],
        }),
      })
    );
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_planner_proposal_service", {
      p_target_owner_id: "11111111-1111-4111-8111-111111111111",
      p_scope_month: "2026-08-01",
      p_operations: [{ op: "clear_month" }],
      p_note: undefined,
    });
  });
});
