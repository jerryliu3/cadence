// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import { POST } from "./route";

describe("POST /api/health/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { deleted_count: 3, recomputed_days: 2 },
      error: null,
    });
  });

  it("returns integrations_disabled when the flag is off", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    const response = await POST(
      new Request("http://localhost/api/health/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "apple_healthkit" }),
      })
    );
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("purges a provider without returning raw health values", async () => {
    const response = await POST(
      new Request("http://localhost/api/health/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "apple_healthkit" }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("disconnect_health_provider_service", {
      p_provider: "apple_healthkit",
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      provider: "apple_healthkit",
      deletedCount: 3,
      recomputedDays: 2,
    });
    expect(JSON.stringify(payload)).not.toMatch(/value_numeric|kcal|heart/i);
  });
});
