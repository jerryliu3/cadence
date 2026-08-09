import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    rpc,
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

    const result = await requireAdminContext("moderator");
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

    const result = await requireAdminContext("admin");
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("admin-1");
  });
});
