// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { POST } from "./route";

function buildProfilesFromStub() {
  return vi.fn((table: string) => {
    if (table !== "profiles") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const selectChain = {
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: { calendar_feed_token_version: 2 },
            error: null,
          }),
      }),
    };

    const updateChain = {
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { calendar_feed_token_version: 3 },
              error: null,
            }),
        }),
      }),
    };

    return {
      select: () => selectChain,
      update: () => updateChain,
    };
  });
}

describe("POST /api/integrations/calendar/feed/rotate", () => {
  beforeEach(() => {
    vi.stubEnv("CALENDAR_FEED_HMAC_KEY", "calendar-feed-key-1234567890");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cadence.app");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.adminFrom.mockImplementation(buildProfilesFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("rotates token version and returns a feed URL", async () => {
    const request = new Request("https://cadence.app/api/integrations/calendar/feed/rotate", {
      method: "POST",
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      tokenVersion: number;
      feedUrl: string;
      token: string;
    };
    expect(payload.tokenVersion).toBe(3);
    expect(payload.feedUrl).toContain("/api/integrations/calendar/feed/");
    expect(payload.feedUrl).toContain("/cadence.ics");
    expect(payload.token.length).toBeGreaterThan(10);
  });
});
