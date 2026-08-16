// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  selectMaybeSingle: vi.fn(),
  updateMaybeSingle: vi.fn(),
  updateValues: vi.fn(),
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: async (request: Request) => {
    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : undefined;

    return {
      accessToken,
      supabase: {
        auth: {
          getUser: mocks.getUser,
        },
        from: (table: string) => {
          if (table !== "profiles") {
            throw new Error(`Unexpected table ${table}`);
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: mocks.selectMaybeSingle,
              }),
            }),
            update: (values: Record<string, unknown>) => {
              mocks.updateValues(values);
              return {
                eq: () => ({
                  select: () => ({
                    maybeSingle: mocks.updateMaybeSingle,
                  }),
                }),
              };
            },
          };
        },
      },
    };
  },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

import { GET, PUT } from "./route";

describe("notifications preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "11111111-1111-4111-8111-111111111111" },
      },
      error: null,
    });
    mocks.selectMaybeSingle.mockResolvedValue({
      data: {
        notification_preferences: {
          daily_reminders: true,
          team_updates: true,
          partner_activity: true,
        },
      },
      error: null,
    });
    mocks.updateMaybeSingle.mockResolvedValue({
      data: {
        notification_preferences: {
          daily_reminders: true,
          team_updates: true,
          partner_activity: true,
        },
      },
      error: null,
    });
  });

  it("returns authentication_required for unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/api/notifications/preferences", {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
      correlationId: expect.any(String),
    });
  });

  it("loads and normalizes persisted preferences", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: {
        notification_preferences: {
          daily_reminders: false,
        },
      },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/api/notifications/preferences", {
        method: "GET",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notificationPreferences: {
        daily_reminders: false,
        team_updates: true,
        partner_activity: true,
      },
      correlationId: expect.any(String),
    });
  });

  it("returns validation_failed for malformed payloads", async () => {
    const response = await PUT(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationPreferences: {
            daily_reminders: "yes",
            team_updates: true,
            partner_activity: true,
          },
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      correlationId: expect.any(String),
    });
    expect(mocks.updateValues).not.toHaveBeenCalled();
  });

  it("persists profile preferences and returns the saved payload", async () => {
    mocks.updateMaybeSingle.mockResolvedValue({
      data: {
        notification_preferences: {
          daily_reminders: true,
          team_updates: false,
          partner_activity: false,
        },
      },
      error: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationPreferences: {
            daily_reminders: true,
            team_updates: false,
            partner_activity: false,
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notificationPreferences: {
        daily_reminders: true,
        team_updates: false,
        partner_activity: false,
      },
      correlationId: expect.any(String),
    });
    expect(mocks.updateValues).toHaveBeenCalledWith({
      notification_preferences: {
        daily_reminders: true,
        team_updates: false,
        partner_activity: false,
      },
    });
  });
});
