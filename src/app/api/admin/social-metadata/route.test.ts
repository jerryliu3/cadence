// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  categoriesOrder: vi.fn(),
  cohortsOrder: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "goal_categories") {
        return {
          select: () => ({
            order: mocks.categoriesOrder,
          }),
        };
      }
      if (table === "cohorts") {
        return {
          select: () => ({
            order: mocks.cohortsOrder,
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/social-metadata", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.categoriesOrder.mockReset();
    mocks.cohortsOrder.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/admin/social-metadata"));

    expect(response.status).toBe(404);
  });

  it("returns category and cohort metadata for admins", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.categoriesOrder.mockResolvedValue({
      data: [{ key: "health", label: "Health" }],
      error: null,
    });
    mocks.cohortsOrder.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "beta-testers",
          title: "Beta Testers",
          is_active: true,
        },
      ],
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/admin/social-metadata"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goalCategories: [{ key: "health", label: "Health" }],
      cohorts: [{ slug: "beta-testers", isActive: true }],
    });
  });
});
