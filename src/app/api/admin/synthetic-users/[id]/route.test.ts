// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  selectEq: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: mocks.update,
      delete: mocks.delete,
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.selectEq,
        }),
      }),
    }),
  }),
}));

import { DELETE, PATCH } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const rosterRow = {
  user_id: USER_ID,
  username: "noah_nguyen",
  display_name: "Noah Nguyen",
  social_activity_visible: true,
  persona: "low",
  archetype: "student",
  daily_budget: 2,
  completions_today: 1,
  last_active_date: "2026-08-22",
  enabled: false,
  goal_count: 6,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

describe("PATCH /api/admin/synthetic-users/[id]", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.update.mockReset();
    mocks.update.mockReturnValue({
      eq: () => ({
        select: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    });
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await PATCH(
      new Request(`http://localhost/api/admin/synthetic-users/${USER_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: { id: USER_ID } }
    );
    expect(response.status).toBe(404);
  });

  it("updates mutable synthetic user fields", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.maybeSingle.mockResolvedValue({ data: rosterRow, error: null });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/synthetic-users/${USER_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          persona: "low",
          dailyBudget: 2,
        }),
      }),
      { params: { id: USER_ID } }
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      enabled: false,
      persona: "low",
      daily_budget: 2,
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      item: {
        userId: USER_ID,
        enabled: false,
        persona: "low",
        dailyBudget: 2,
      },
    });
  });
});

describe("DELETE /api/admin/synthetic-users/[id]", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.delete.mockReset();
    mocks.selectEq.mockReset();
    mocks.delete.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("disables the synthetic user instead of deleting it", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.selectEq.mockResolvedValue({ data: rosterRow, error: null });

    const response = await DELETE(
      new Request(`http://localhost/api/admin/synthetic-users/${USER_ID}`, {
        method: "DELETE",
      }),
      { params: { id: USER_ID } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      item: {
        userId: USER_ID,
        enabled: false,
      },
    });
  });
});
