import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/api/route", () => ({
  requireAuthenticatedRequestContext: vi.fn(async () => ({
    userId: "user-1",
    supabase: {
      auth: { getUser },
      rpc,
    },
  })),
}));

import { requireAdminContext } from "@/lib/api/admin-context";

describe("requireAdminContext", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
  });

  it("returns null when user is not admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: false,
      error: null,
    });

    const result = await requireAdminContext(new Request("http://localhost"), "moderator");
    expect(result).toBeNull();
    expect(rpc).toHaveBeenCalledWith("is_platform_admin", {
      p_min_role: "moderator",
    });
  });

  it("returns admin context when admin check passes", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const result = await requireAdminContext(new Request("http://localhost"), "admin");
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-1");
  });
});
