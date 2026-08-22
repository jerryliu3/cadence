// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/api/admin-context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: mocks.update,
    }),
  }),
}));

import { PATCH } from "./route";

const configRow = {
  id: 1,
  enabled: false,
  max_completions_per_tick: 4,
  max_reactions_per_tick: 6,
  throttle_above_real_dau: 40,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

describe("PATCH /api/admin/synthetic-config", () => {
  beforeEach(() => {
    mocks.requireAdminContext.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.update.mockReset();
    mocks.update.mockReturnValue({
      eq: () => ({
        select: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    });
  });

  it("returns 404 for non-admin users", async () => {
    mocks.requireAdminContext.mockResolvedValue(null);
    const response = await PATCH(
      new Request("http://localhost/api/admin/synthetic-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      })
    );
    expect(response.status).toBe(404);
  });

  it("updates the synthetic config singleton", async () => {
    mocks.requireAdminContext.mockResolvedValue({
      userId: "admin-1",
      supabase: {},
    });
    mocks.maybeSingle.mockResolvedValue({ data: configRow, error: null });

    const response = await PATCH(
      new Request("http://localhost/api/admin/synthetic-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          maxCompletionsPerTick: 4,
          maxReactionsPerTick: 6,
          throttleAboveRealDau: 40,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      enabled: false,
      max_completions_per_tick: 4,
      max_reactions_per_tick: 6,
      throttle_above_real_dau: 40,
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      config: {
        enabled: false,
        maxCompletionsPerTick: 4,
        maxReactionsPerTick: 6,
        throttleAboveRealDau: 40,
      },
    });
  });
});
