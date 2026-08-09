// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileUpsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      upsert: mocks.profileUpsert,
    })),
  }),
}));

import { PUT } from "./route";

describe("profiles route PUT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await PUT(
      new Request("http://localhost/api/profiles", {
        method: "PUT",
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
    const response = await PUT(
      new Request("http://localhost/api/profiles", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "" }),
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
    mocks.profileUpsert.mockResolvedValue({
      error: {
        code: "42501",
        message:
          'new row violates row-level security policy for table "profiles"',
      },
    });
    const response = await PUT(
      new Request("http://localhost/api/profiles", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "jerry",
          displayName: "Jerry",
          avatarUrl: null,
        }),
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
  });
});
