// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  orderUsers: vi.fn(),
  configSingle: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { GET, POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const rosterRow = {
  user_id: USER_ID,
  username: "noah_nguyen",
  display_name: "Noah Nguyen",
  social_activity_visible: true,
  persona: "medium",
  archetype: "student",
  daily_budget: 3,
  completions_today: 1,
  last_active_date: "2026-08-22",
  enabled: true,
  goal_count: 6,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

const configRow = {
  id: 1,
  enabled: true,
  max_completions_per_tick: 8,
  max_reactions_per_tick: 12,
  throttle_above_real_dau: 50,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

describe("GET /api/admin/synthetic-users", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.orderUsers.mockReset();
    mocks.configSingle.mockReset();
    mocks.from.mockImplementation((table: string) => {
      if (table === "admin_synthetic_users") {
        return {
          select: () => ({
            order: mocks.orderUsers,
          }),
        };
      }
      if (table === "synthetic_config") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: mocks.configSingle,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/admin/synthetic-users"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "not_found",
    });
  });

  it("returns synthetic users and config for admins", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.orderUsers.mockResolvedValue({ data: [rosterRow], error: null });
    mocks.configSingle.mockResolvedValue({ data: configRow, error: null });

    const response = await GET(new Request("http://localhost/api/admin/synthetic-users"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      items: [
        {
          userId: USER_ID,
          username: "noah_nguyen",
          persona: "medium",
          dailyBudget: 3,
          goalCount: 6,
        },
      ],
      config: {
        enabled: true,
        maxCompletionsPerTick: 8,
        maxReactionsPerTick: 12,
        throttleAboveRealDau: 50,
      },
    });
  });
});

describe("POST /api/admin/synthetic-users", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.rpc.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/admin/synthetic-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: 20 }),
      })
    );
    expect(response.status).toBe(404);
  });

  it("provisions synthetic users to the requested target count", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.rpc.mockResolvedValue({ data: 20, error: null });

    const response = await POST(
      new Request("http://localhost/api/admin/synthetic-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: 20, goalsPerUser: 6 }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("provision_synthetic_users_service", {
      p_target_count: 20,
      p_goals_per_user: 6,
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      provisionedCount: 20,
    });
  });
});
