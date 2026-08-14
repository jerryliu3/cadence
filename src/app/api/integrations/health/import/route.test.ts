// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  serverFrom: vi.fn(),
  rpc: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.serverFrom,
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { POST } from "./route";

function buildServerFromStub() {
  return vi.fn((table: string) => {
    if (table !== "profiles") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { timezone: "UTC" },
              error: null,
            }),
        }),
      }),
    };
  });
}

function buildAdminFromStub() {
  return vi.fn((table: string) => {
    if (table === "integration_health_daily_rollups") {
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

describe("POST /api/integrations/health/import", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.serverFrom.mockImplementation(buildServerFromStub());
    mocks.adminFrom.mockImplementation(buildAdminFromStub());
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("imports rollups and applies allowed external completions", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await POST(
      new Request("http://localhost/api/integrations/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "garmin",
          dailyRollups: [
            {
              day: today,
              steps: 8000,
              activeMinutes: 45,
              workoutCount: 1,
              sourceHash: "hash-1",
            },
          ],
          autoCompletions: [
            {
              goalId: "11111111-1111-4111-8111-111111111111",
              completedOn: today,
              externalKey: "run-1",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      importedDays: 1,
      appliedCompletions: 1,
    });
  });
});
