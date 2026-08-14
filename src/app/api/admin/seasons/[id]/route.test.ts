// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  maybeSingle: vi.fn(),
  updateSingle: vi.fn(),
  deleteEq: vi.fn(),
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
      update: () => ({
        eq: () => ({
          select: () => ({
            single: mocks.updateSingle,
          }),
        }),
      }),
      delete: () => ({
        eq: mocks.deleteEq,
      }),
    }),
  }),
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/seasons/[id]", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.updateSingle.mockReset();
    mocks.deleteEq.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/admin/seasons/11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
      }),
      { params: { id: "11111111-1111-4111-8111-111111111111" } }
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when season does not exist", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await DELETE(
      new Request("http://localhost/api/admin/seasons/11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
      }),
      { params: { id: "11111111-1111-4111-8111-111111111111" } }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "season_not_found",
    });
  });

  it("deletes season rows for admins", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
    mocks.deleteEq.mockResolvedValue({ error: null });

    const response = await DELETE(
      new Request("http://localhost/api/admin/seasons/11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
      }),
      { params: { id: "11111111-1111-4111-8111-111111111111" } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deleted: true,
    });
  });
});
