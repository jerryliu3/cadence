// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { createCalendarFeedToken } from "@/lib/integrations/calendar/feed-token";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { GET } from "./route";

function buildFromStub() {
  return vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { calendar_feed_token_version: 2 },
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "planner_items") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({
                  order: () =>
                    Promise.resolve({
                      data: [
                        {
                          goal_id: "11111111-1111-4111-8111-111111111111",
                          unit_key: "milestone:1",
                          scheduled_date: "2026-08-20",
                          scheduled_time: "07:30",
                          goals: {
                            title: "Ride 40 miles",
                            default_local_time: null,
                            is_deleted: false,
                          },
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("GET /api/integrations/calendar/feed/[token]/cadence.ics", () => {
  beforeEach(() => {
    vi.stubEnv("CALENDAR_FEED_HMAC_KEY", "calendar-feed-key-1234567890");
    resetEnvCacheForTests();
    mocks.adminFrom.mockImplementation(buildFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 404 for invalid tokens", async () => {
    const response = await GET(new Request("https://cadence.app"), {
      params: Promise.resolve({ token: "invalid" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns an ics payload for valid tokens", async () => {
    const token = createCalendarFeedToken({
      userId: "11111111-1111-4111-8111-111111111111",
      version: 2,
      hmacKey: "calendar-feed-key-1234567890",
    });
    const response = await GET(new Request("https://cadence.app"), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    await expect(response.text()).resolves.toContain("BEGIN:VCALENDAR");
  });
});
