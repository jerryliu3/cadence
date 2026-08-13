import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  socialEnabled: true,
  reportError: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (flag: string) => flag === "socialEnabled" && mocks.socialEnabled,
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));

import { loadDuoContext } from "@/lib/social/duo/load-duo-context";

describe("loadDuoContext", () => {
  beforeEach(() => {
    mocks.socialEnabled = true;
    mocks.reportError.mockReset();
  });

  it("returns ready empty state when social is disabled", async () => {
    mocks.socialEnabled = false;
    const result = await loadDuoContext({
      supabase: { rpc: vi.fn() } as never,
    });
    expect(result).toEqual({
      availability: "ready",
      state: { activePartner: null, pendingInvite: null },
    });
  });

  it("returns unavailable and reports when get_team_state fails", async () => {
    const error = { message: "timeout" };
    const result = await loadDuoContext({
      supabase: {
        rpc: async () => ({ data: null, error }),
      } as never,
    });
    expect(result.availability).toBe("unavailable");
    expect(result.state.activePartner).toBeNull();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("returns ready with no partner when the RPC is empty", async () => {
    const result = await loadDuoContext({
      supabase: {
        rpc: async () => ({ data: [], error: null }),
      } as never,
    });
    expect(result.availability).toBe("ready");
    expect(result.state.activePartner).toBeNull();
    expect(mocks.reportError).not.toHaveBeenCalled();
  });
});
