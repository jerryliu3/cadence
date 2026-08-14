// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

import { GET } from "./route";

function buildFromStub() {
  return vi.fn((table: string) => {
    if (table !== "integration_calendar_busy_days") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        day: "2026-08-14",
                        busy_minutes: 180,
                        source_hash: "hash-1",
                        updated_at: "2026-08-14T00:00:00.000Z",
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
  });
}

describe("GET /api/integrations/google/calendar/busy", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.from.mockImplementation(buildFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns busy minutes for a date window", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/integrations/google/calendar/busy?from=2026-08-01&to=2026-08-31"
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      days: [{ day: "2026-08-14", busyMinutes: 180 }],
    });
  });
});
