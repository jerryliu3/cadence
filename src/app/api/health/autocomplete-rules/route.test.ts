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

import { DELETE, PUT } from "./route";

describe("/api/health/autocomplete-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
  });

  it("saves an opt-in rule", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: "rule-1",
        goal_id: "11111111-1111-4111-8111-111111111111",
        metric_key: "steps",
        threshold_numeric: 8000,
        enabled: true,
      },
      error: null,
    });
    const response = await PUT(
      new Request("http://localhost/api/health/autocomplete-rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalId: "11111111-1111-4111-8111-111111111111",
          metricKey: "steps",
          thresholdNumeric: 8000,
        }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rule: {
        goalId: "11111111-1111-4111-8111-111111111111",
        metricKey: "steps",
        thresholdNumeric: 8000,
        enabled: true,
      },
    });
  });

  it("deletes a rule by id", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const response = await DELETE(
      new Request(
        "http://localhost/api/health/autocomplete-rules?id=11111111-1111-4111-8111-111111111111"
      )
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "delete_health_autocomplete_rule_service",
      { p_rule_id: "11111111-1111-4111-8111-111111111111" }
    );
  });
});
