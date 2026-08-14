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
    if (table === "integration_calendar_busy_days") {
      return {
        upsert: () => Promise.resolve({ error: null }),
      };
    }
    if (table === "oauth_connections") {
      return {
        update: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    }
    if (table === "integration_sync_runs") {
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("POST /api/integrations/google/calendar/pull", () => {
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

  it("imports busy-day rows", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrations/google/calendar/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: [
            { day: "2026-08-14", busyMinutes: 180, sourceHash: "abc" },
            { day: "2026-08-15", busyMinutes: 90, sourceHash: "def" },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      importedDays: 2,
    });
  });
});
