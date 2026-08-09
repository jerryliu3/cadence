// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  goalInsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn((table: string) => {
      if (table === "goals") {
        return {
          insert: mocks.goalInsert,
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      if (table === "goal_participants") {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      return {};
    }),
  }),
}));

import { POST } from "./route";

describe("goals route POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("returns 400 for invalid payloads", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: {} }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
    });
  });

  it("maps RLS database write errors to 403", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.goalInsert.mockResolvedValue({
      error: {
        code: "42501",
        message: 'new row violates row-level security policy for table "goals"',
      },
    });

    const response = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: {
            title: "Read 20 pages",
            description: null,
            category: "Personal",
            color: null,
            frequency_type: "recurring",
            recurrence_interval: "daily",
            target_count: null,
            milestone_names: null,
            start_date: "2026-08-01",
            end_date: null,
            default_local_time: null,
            is_group: false,
          },
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "forbidden",
    });
  });
});
