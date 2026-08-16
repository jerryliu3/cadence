// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

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

describe("POST /api/social/cohorts/join", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: "70000000-0000-4000-8000-000000000001",
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 503 when social is disabled", async () => {
    vi.stubEnv("SOCIAL_ENABLED", "false");
    resetEnvCacheForTests();
    const response = await POST(
      new Request("http://localhost/api/social/cohorts/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: "ALPHA1" }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_disabled",
    });
  });

  it("joins a group by code", async () => {
    const response = await POST(
      new Request("http://localhost/api/social/cohorts/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: "ALPHA1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("join_group_with_code_service", {
      p_join_code: "ALPHA1",
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      groupId: "70000000-0000-4000-8000-000000000001",
    });
  });

  it("falls back to legacy cohort RPC while migration rolls out", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "function public.join_group_with_code_service does not exist", code: "42883" },
      })
      .mockResolvedValueOnce({
        data: "70000000-0000-4000-8000-000000000001",
        error: null,
      });

    const response = await POST(
      new Request("http://localhost/api/social/cohorts/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: "ALPHA1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "join_group_with_code_service", {
      p_join_code: "ALPHA1",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "join_cohort_with_code_service", {
      p_join_code: "ALPHA1",
    });
  });
});
