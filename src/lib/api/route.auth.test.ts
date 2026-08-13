import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRouteError } from "@/lib/api/route";

const mocks = vi.hoisted(() => ({
  createRouteClient: vi.fn(),
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: mocks.createRouteClient,
}));

import { requireAuthenticatedRequestContext } from "@/lib/api/route";

describe("requireAuthenticatedRequestContext", () => {
  const getUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockReset();
  });

  it("uses cookie getUser when no bearer token is present", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "cookie-user" } },
      error: null,
    });
    mocks.createRouteClient.mockResolvedValue({
      supabase: { auth: { getUser } },
      accessToken: null,
    });

    const result = await requireAuthenticatedRequestContext(
      new Request("http://localhost")
    );
    expect(result.userId).toBe("cookie-user");
    expect(getUser).toHaveBeenCalledWith();
  });

  it("throws 401 when the cookie session is missing", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    mocks.createRouteClient.mockResolvedValue({
      supabase: { auth: { getUser } },
      accessToken: null,
    });

    await expect(
      requireAuthenticatedRequestContext(new Request("http://localhost"))
    ).rejects.toBeInstanceOf(ApiRouteError);
  });

  it("validates a bearer token with getUser(accessToken)", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "bearer-user" } },
      error: null,
    });
    mocks.createRouteClient.mockResolvedValue({
      supabase: { auth: { getUser } },
      accessToken: "user-jwt",
    });

    const result = await requireAuthenticatedRequestContext(
      new Request("http://localhost", {
        headers: { authorization: "Bearer user-jwt" },
      })
    );
    expect(result.userId).toBe("bearer-user");
    expect(getUser).toHaveBeenCalledWith("user-jwt");
  });

  it("throws 401 for an expired or malformed bearer token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    mocks.createRouteClient.mockResolvedValue({
      supabase: { auth: { getUser } },
      accessToken: "expired-jwt",
    });

    await expect(
      requireAuthenticatedRequestContext(
        new Request("http://localhost", {
          headers: { authorization: "Bearer expired-jwt" },
        })
      )
    ).rejects.toMatchObject({
      status: 401,
      code: "authentication_required",
    });
    expect(getUser).toHaveBeenCalledWith("expired-jwt");
  });
});
