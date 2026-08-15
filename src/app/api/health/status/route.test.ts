// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  getUser: vi.fn(),
  eqState: vi.fn(),
  eqRules: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => ({
      select: () => ({
        eq: table === "health_autocomplete_rules" ? mocks.eqRules : mocks.eqState,
      }),
    }),
  }),
}));

import { GET } from "./route";

describe("GET /api/health/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T18:00:00.000Z"));
    mocks.isFeatureEnabled.mockReturnValue(true);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.eqState.mockResolvedValue({ data: [], error: null });
    mocks.eqRules.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns integrations_disabled when the flag is off", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/health/status")
    );
    expect(response.status).toBe(503);
  });

  it("returns evidence states without raw health values", async () => {
    mocks.eqState.mockResolvedValue({
      data: [
        {
          provider: "apple_healthkit",
          permission_prompted_at: "2026-08-14T12:00:00.000Z",
          last_ingest_at: "2026-08-14T17:00:00.000Z",
          last_sample_at: "2026-08-14T17:00:00.000Z",
          last_error: "token expired",
        },
      ],
      error: null,
    });
    mocks.eqRules.mockResolvedValue({
      data: [
        {
          id: "rule-1",
          goal_id: "goal-1",
          metric_key: "steps",
          threshold_numeric: 8000,
          enabled: true,
        },
      ],
      error: null,
    });
    const response = await GET(
      new Request("http://localhost/api/health/status")
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.providers).toEqual([
      expect.objectContaining({
        provider: "apple_healthkit",
        state: "receiving_data",
        lastError: "token expired",
      }),
      expect.objectContaining({
        provider: "android_health_connect",
        state: "never_asked",
      }),
    ]);
    expect(payload.autocompleteRules).toEqual([
      expect.objectContaining({
        goalId: "goal-1",
        metricKey: "steps",
        thresholdNumeric: 8000,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/value_numeric|heart/i);
  });
});
