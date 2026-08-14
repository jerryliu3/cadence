// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  upsert: vi.fn(),
  createAdminClient: vi.fn(),
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from "./route";

const sample = {
  providerNativeId: "hk-1",
  sourceIdentifier: "com.apple.health",
  metricKey: "steps",
  startedAt: "2026-08-14T04:00:00.000Z",
  utcOffsetMinutes: -240,
  valueNumeric: 1200,
  unit: "count",
};

describe("POST /api/health/samples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "apply_health_autocomplete_service") {
        return { data: { applied_count: 1, skipped_count: 0 }, error: null };
      }
      return {
        data: {
          ingested_count: 1,
          canonical_count: 1,
          suppressed_count: 0,
          recomputed_days: 1,
        },
        error: null,
      };
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockReturnValue({
      from: () => ({ upsert: mocks.upsert }),
    });
  });

  it("returns integrations_disabled when the flag is off", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "apple_healthkit",
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "integrations_disabled",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "apple_healthkit",
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "garmin",
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("strips token fields and ingests normalized samples", async () => {
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "apple_healthkit",
          permissionPrompted: true,
          accessToken: "secret",
          refreshToken: "secret",
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("ingest_health_activities_service", {
      p_samples: [
        expect.objectContaining({
          provider: "apple_healthkit",
          provider_native_id: "hk-1",
          utc_offset_minutes: -240,
        }),
      ],
      p_deleted_native_ids: [],
    });
    const rpcArgs = mocks.rpc.mock.calls[0]?.[1] as { p_samples: unknown[] };
    expect(JSON.stringify(rpcArgs)).not.toContain("secret");
    expect(JSON.stringify(rpcArgs)).not.toContain("accessToken");
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      ingestedCount: 1,
      canonicalCount: 1,
    });
  });

  it("applies auto-complete after ingest when localToday is provided", async () => {
    const localToday = new Date().toISOString().slice(0, 10);
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "apple_healthkit",
          localToday,
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_health_autocomplete_service", {
      p_local_today: localToday,
    });
    await expect(response.json()).resolves.toMatchObject({
      autocompleteAppliedCount: 1,
      autocompleteSkippedCount: 0,
      skippedCount: 0,
    });
  });

  it("rejects localToday outside the UTC offset envelope", async () => {
    const response = await POST(
      new Request("http://localhost/api/health/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "apple_healthkit",
          localToday: "2099-06-15",
          samples: [sample],
        }),
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "local_today_out_of_range",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
