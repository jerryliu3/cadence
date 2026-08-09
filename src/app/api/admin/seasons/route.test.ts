// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: mocks.select,
      order: mocks.order,
      insert: vi.fn(),
      single: vi.fn(),
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/seasons", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.select.mockReset();
    mocks.order.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns season rows for admins", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.select.mockReturnValue({
      order: mocks.order,
    });
    mocks.order.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "aug-open",
          title: "August Open",
          status: "open",
        },
      ],
      error: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ slug: "aug-open" }],
    });
  });
});
