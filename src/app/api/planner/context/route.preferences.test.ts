// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  adminProfileSelectMaybeSingle: vi.fn(),
  adminProfileUpdateMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.profileMaybeSingle,
        }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.adminProfileSelectMaybeSingle,
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: mocks.adminProfileUpdateMaybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

import { PUT } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/planner/context", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const timezone = "America/New_York";
const timezoneConfirmedAt = "2026-01-01T00:00:00.000Z";
const defaultPolicy = {
  schemaVersion: "1",
  timezone,
  timezoneConfirmedAt,
  weekStartsOn: 1,
  restWeekdays: [],
  blackoutRanges: [],
};

describe("planner context preferences route", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: {
        timezone,
        timezone_confirmed_at: timezoneConfirmedAt,
        week_starts_on: 1,
        rest_weekdays: [],
        blackout_ranges: [],
      },
      error: null,
    });
    mocks.adminProfileUpdateMaybeSingle.mockResolvedValue({
      data: {
        timezone,
        timezone_confirmed_at: timezoneConfirmedAt,
        week_starts_on: 1,
        rest_weekdays: [],
        blackout_ranges: [],
      },
      error: null,
    });
    mocks.adminProfileSelectMaybeSingle.mockResolvedValue({
      data: {
        week_starts_on: 1,
      },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
    vi.restoreAllMocks();
  });

  it("persists profile-backed planner preferences", async () => {
    const response = await PUT(
      request({
        timezone,
        defaultPolicy,
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      preferences: {
        timezone,
        policyRevision: 1,
      },
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
    });
  });

  it("does not depend on planner state RPC after profile updates", async () => {
    const response = await PUT(
      request({
        timezone,
        defaultPolicy,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      preferences: {
        timezone,
        policyRevision: 1,
      },
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
