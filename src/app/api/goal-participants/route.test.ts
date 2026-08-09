// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  participantInsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      insert: mocks.participantInsert,
    })),
  }),
}));

import { POST } from "./route";

describe("goal-participants route POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(
      new Request("http://localhost/api/goal-participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    const response = await POST(
      new Request("http://localhost/api/goal-participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId: "bad" }),
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
    mocks.participantInsert.mockResolvedValue({
      error: {
        code: "42501",
        message:
          'new row violates row-level security policy for table "goal_participants"',
      },
    });
    const response = await POST(
      new Request("http://localhost/api/goal-participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalId: "10000000-0000-4000-8000-000000000001",
          userId: "10000000-0000-4000-8000-000000000002",
          role: "participant",
        }),
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
  });
});
