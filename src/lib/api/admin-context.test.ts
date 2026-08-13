import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRouteError } from "@/lib/api/route";

const getUser = vi.fn();
const rpc = vi.fn();
const cookieGetUser = vi.fn();
const cookieRpc = vi.fn();

vi.mock("@/lib/api/route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/route")>();
  return {
    ...actual,
    requireAuthenticatedRequestContext: vi.fn(async () => ({
      userId: "user-1",
      supabase: {
        auth: { getUser },
        rpc,
      },
    })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: cookieGetUser },
    rpc: cookieRpc,
  })),
}));

import {
  requireAdminContext,
  requireAdminContextFromCookies,
} from "@/lib/api/admin-context";

describe("requireAdminContext", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    cookieGetUser.mockReset();
    cookieRpc.mockReset();
  });

  it("returns null when user is not admin", async () => {
    rpc.mockResolvedValue({
      data: false,
      error: null,
    });

    const result = await requireAdminContext(
      new Request("http://localhost"),
      "moderator"
    );
    expect(result).toBeNull();
    expect(rpc).toHaveBeenCalledWith("is_platform_admin", {
      p_min_role: "moderator",
    });
  });

  it("returns admin context when admin check passes", async () => {
    rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const result = await requireAdminContext(
      new Request("http://localhost"),
      "admin"
    );
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-1");
  });
});

describe("requireAdminContextFromCookies", () => {
  it("throws 401 when no cookie user is present", async () => {
    cookieGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(requireAdminContextFromCookies("moderator")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiRouteError",
        status: 401,
        code: "authentication_required",
      })
    );
    expect(cookieRpc).not.toHaveBeenCalled();
  });

  it("returns null when the cookie user is not an admin", async () => {
    cookieGetUser.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    cookieRpc.mockResolvedValue({
      data: false,
      error: null,
    });

    await expect(requireAdminContextFromCookies("moderator")).resolves.toBeNull();
  });

  it("returns context when the cookie user is an admin", async () => {
    cookieGetUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    cookieRpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const result = await requireAdminContextFromCookies("admin");
    expect(result).toEqual(
      expect.objectContaining({
        userId: "admin-1",
      })
    );
  });
});

describe("ApiRouteError shape used by admin layout", () => {
  it("is an ApiRouteError instance for unauthenticated cookies", async () => {
    cookieGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    try {
      await requireAdminContextFromCookies();
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRouteError);
      expect((error as ApiRouteError).status).toBe(401);
    }
  });
});
