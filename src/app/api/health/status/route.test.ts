// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  getUser: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mocks.isFeatureEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: mocks.eq,
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
    mocks.eq.mockResolvedValue({ data: [], error: null });
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
    mocks.eq.mockResolvedValue({
      data: [
        {
          provider: "apple_healthkit",
          permission_prompted_at: "2026-08-14T12:00:00.000Z",
          last_ingest_at: "2026-08-14T17:00:00.000Z",
          last_sample_at: "2026-08-14T17:00:00.000Z",
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
      }),
      expect.objectContaining({
        provider: "android_health_connect",
        state: "never_asked",
      }),
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/steps|kcal|heart/i);
  });
});
