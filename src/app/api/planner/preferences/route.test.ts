// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
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
  return new Request("http://localhost/api/planner/preferences", {
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

describe("planner preferences route", () => {
  beforeEach(() => {
    vi.stubEnv("CALENDAR_ENABLED", "true");
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
    mocks.rpc.mockResolvedValue({
      data: [{ canonical_revision: 11, execution_revision: 5 }],
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
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
        canonicalRevision: 11,
        executionRevision: 5,
      },
    });
  });

  it("degrades post-commit revision reload failures instead of returning 500", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "revision reload failed" },
    });

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
});
