// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: mocks.select,
      order: mocks.order,
      insert: mocks.insert,
      single: mocks.single,
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/admin/challenges", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.select.mockReset();
    mocks.order.mockReset();
    mocks.insert.mockReset();
    mocks.single.mockReset();
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "not_found",
    });
  });

  it("returns challenge rows for admins", async () => {
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
          slug: "aug-completions",
          title: "August Completions",
          description: null,
          status: "active",
          enrollment: "opt_in",
          subject_kind: "user",
          metric: "completions_count",
          metric_track_key: null,
          target_value: 10,
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-09-01T00:00:00.000Z",
          reward_xp: 25,
          max_participants: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      items: [
        {
          slug: "aug-completions",
          metric: "completions_count",
          targetValue: 10,
        },
      ],
    });
  });
});
