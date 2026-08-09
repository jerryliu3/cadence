// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/xp/awards/acknowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/xp/awards/acknowledge", () => {
  beforeEach(() => {
    vi.stubEnv("XP_ENABLED", "true");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when XP is disabled", async () => {
    vi.stubEnv("XP_ENABLED", "false");
    const response = await POST(request({ awardId: "a2785c72-5d33-41ec-bde8-a32976132f3d" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "xp_disabled" });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const response = await POST(request({ awardId: "a2785c72-5d33-41ec-bde8-a32976132f3d" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("returns 200 when acknowledgement succeeds", async () => {
    const response = await POST(request({ awardId: "a2785c72-5d33-41ec-bde8-a32976132f3d" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      acknowledged: true,
    });
  });

  it("returns 404 when award row is not found", async () => {
    mocks.rpc.mockResolvedValue({
      data: false,
      error: null,
    });
    const response = await POST(request({ awardId: "a2785c72-5d33-41ec-bde8-a32976132f3d" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "award_not_found",
    });
  });

  it("returns 404 when rpc reports ownership mismatch", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "award_not_owned" },
    });
    const response = await POST(request({ awardId: "a2785c72-5d33-41ec-bde8-a32976132f3d" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "award_not_found",
    });
  });
});
