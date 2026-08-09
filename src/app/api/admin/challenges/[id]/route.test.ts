// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
      update: mocks.update,
      delete: vi.fn(),
    }),
  }),
}));

import { PATCH } from "./route";

describe("PATCH /api/admin/challenges/[id]", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.update.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await PATCH(
      new Request("http://localhost/api/admin/challenges/11111111-1111-4111-8111-111111111111", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: { id: "11111111-1111-4111-8111-111111111111" } }
    );
    expect(response.status).toBe(404);
  });

  it("rejects immutable updates on active challenges", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "active",
      },
      error: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/admin/challenges/11111111-1111-4111-8111-111111111111", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetValue: 20 }),
      }),
      { params: { id: "11111111-1111-4111-8111-111111111111" } }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "challenge_active_field_locked",
    });
  });
});
