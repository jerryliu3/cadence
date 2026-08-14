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

function buildAdminFromStub() {
  return vi.fn((table: string) => {
    if (table !== "planner_items") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
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
                      },
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };
  });
}

describe("POST /api/integrations/google/calendar/push", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.adminFrom.mockImplementation(buildAdminFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("projects planner items into calendar event payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrations/google/calendar/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "2026-08-01",
          to: "2026-08-31",
          dryRun: true,
        }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dryRun: true,
      events: [{ externalKey: "11111111-1111-4111-8111-111111111111:milestone:1" }],
    });
  });
});
