// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  fetchSchedules: vi.fn(),
  claimSchedule: vi.fn(),
  releaseSchedule: vi.fn(),
  from: vi.fn(),
  profileRows: [] as Array<{
    id: string;
    notification_preferences: Record<string, unknown>;
  }>,
  profileLookupError: null as null | { message: string },
  reportError: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.from,
  }),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: mocks.reportError,
}));

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: mocks.sendPushToUser,
}));

import { GET } from "./route";

function prepareDueSchedule() {
  mocks.fetchSchedules.mockResolvedValue({
    data: [
      {
        id: "schedule-1",
        user_id: "user-1",
        hour: new Date().getUTCHours(),
        timezone: "UTC",
        message: "Keep going",
        last_sent_local_date: null,
      },
    ],
    error: null,
  });
  mocks.claimSchedule.mockResolvedValue({
    data: { id: "schedule-1" },
    error: null,
  });
}

function dispatchRequest() {
  return GET(
    new Request("http://localhost/api/push/dispatch", {
      method: "GET",
      headers: { authorization: "Bearer cron-secret" },
    })
  );
}

describe("push dispatch route", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();

    mocks.getServerEnv.mockReturnValue({
      CRON_SECRET: "cron-secret",
    });
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 0,
    });
    mocks.fetchSchedules.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.claimSchedule.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.releaseSchedule.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.profileRows = [
      {
        id: "user-1",
        notification_preferences: {
          daily_reminders: true,
          team_updates: true,
          partner_activity: true,
        },
      },
    ];
    mocks.profileLookupError = null;
    mocks.from.mockImplementation((table: string) => {
      if (table === "notification_schedules") {
        return {
          select: () => ({
            eq: mocks.fetchSchedules,
          }),
          update: (values: { last_sent_local_date?: string | null }) => ({
            eq: () =>
              values.last_sent_local_date === null
                ? {
                    eq: mocks.releaseSchedule,
                  }
                : {
                    or: () => ({
                      select: () => ({
                        maybeSingle: mocks.claimSchedule,
                      }),
                    }),
                  },
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: async () => ({
              data: mocks.profileLookupError ? null : mocks.profileRows,
              error: mocks.profileLookupError,
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("returns cron_auth_invalid for missing auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/push/dispatch", { method: "GET" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "cron_auth_invalid",
      correlationId: expect.any(String),
    });
  });

  it("rejects a user JWT bearer token on the cron route", async () => {
    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature",
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "cron_auth_invalid",
    });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("returns push_dispatch_unavailable when cron is not configured", async () => {
    mocks.getServerEnv.mockReturnValue({
      CRON_SECRET: "",
    });

    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_dispatch_unavailable",
      correlationId: expect.any(String),
    });
  });

  it("dispatches without VAPID when nothing is due", async () => {
    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 0,
      sent: 0,
      removedSubscriptions: 0,
      correlationId: expect.any(String),
    });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("returns push_dispatch_failed when schedule loading crashes", async () => {
    mocks.fetchSchedules.mockResolvedValue({
      data: null,
      error: { message: "db-failed" },
    });

    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_dispatch_failed",
      correlationId: expect.any(String),
    });
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        code: "push_dispatch_failed",
        status: 500,
      })
    );
  });

  it("releases the claim when downstream push delivery fails", async () => {
    const currentUtcHour = new Date().getUTCHours();
    mocks.fetchSchedules.mockResolvedValue({
      data: [
        {
          id: "schedule-1",
          user_id: "user-1",
          hour: currentUtcHour,
          timezone: "UTC",
          message: "Keep going",
          last_sent_local_date: null,
        },
      ],
      error: null,
    });
    mocks.claimSchedule.mockResolvedValue({
      data: { id: "schedule-1" },
      error: null,
    });
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 1,
    });

    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 0,
      deferred: 1,
      removedSubscriptions: 0,
      correlationId: expect.any(String),
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        payload: expect.objectContaining({
          body: "Keep going",
        }),
      })
    );
    expect(mocks.releaseSchedule).toHaveBeenCalledWith(
      "last_sent_local_date",
      expect.any(String)
    );
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("releases a claimed web-only schedule when VAPID is unavailable", async () => {
    const currentUtcHour = new Date().getUTCHours();
    mocks.fetchSchedules.mockResolvedValue({
      data: [
        {
          id: "schedule-1",
          user_id: "user-1",
          hour: currentUtcHour,
          timezone: "UTC",
          message: "Keep going",
          last_sent_local_date: null,
        },
      ],
      error: null,
    });
    mocks.claimSchedule.mockResolvedValue({
      data: { id: "schedule-1" },
      error: null,
    });
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: true,
      deliveryFailures: 0,
    });

    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 0,
      deferred: 1,
    });
    expect(mocks.releaseSchedule).toHaveBeenCalledWith(
      "last_sent_local_date",
      expect.any(String)
    );
  });

  it("keeps the claim when the user has no push subscriptions", async () => {
    prepareDueSchedule();
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: false,
      webConfigurationUnavailable: false,
      deliveryFailures: 0,
    });

    const response = await dispatchRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 0,
      deferred: 0,
    });
    expect(mocks.releaseSchedule).not.toHaveBeenCalled();
  });

  it("skips due reminders when daily reminder category is disabled", async () => {
    prepareDueSchedule();
    mocks.profileRows = [
      {
        id: "user-1",
        notification_preferences: {
          daily_reminders: false,
          team_updates: true,
          partner_activity: true,
        },
      },
    ];

    const response = await dispatchRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 0,
      sent: 0,
      deferred: 0,
      skipped: 1,
    });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
    expect(mocks.releaseSchedule).not.toHaveBeenCalled();
  });

  it("fails open when reminder preference lookup errors before claiming", async () => {
    prepareDueSchedule();
    mocks.profileLookupError = { message: "profile lookup unavailable" };
    mocks.sendPushToUser.mockResolvedValue({
      sent: 1,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 0,
    });

    const response = await dispatchRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 1,
      deferred: 0,
      skipped: 0,
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim after at least one delivery succeeds", async () => {
    prepareDueSchedule();
    mocks.sendPushToUser.mockResolvedValue({
      sent: 1,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 1,
    });

    const response = await dispatchRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 1,
      deferred: 0,
    });
    expect(mocks.releaseSchedule).not.toHaveBeenCalled();
  });

  it("releases the claim when push delivery throws", async () => {
    prepareDueSchedule();
    mocks.sendPushToUser.mockRejectedValue(new Error("expo unavailable"));

    const response = await dispatchRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
      sent: 0,
      deferred: 1,
    });
    expect(mocks.releaseSchedule).toHaveBeenCalledWith(
      "last_sent_local_date",
      expect.any(String)
    );
  });

  it("reports a claim release failure instead of returning false success", async () => {
    prepareDueSchedule();
    mocks.sendPushToUser.mockRejectedValue(new Error("expo unavailable"));
    mocks.releaseSchedule.mockResolvedValue({
      data: null,
      error: { message: "release failed" },
    });

    const response = await dispatchRequest();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "push_dispatch_failed",
    });
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
  });

  it("retries a deferred schedule later on the same local day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T15:00:00.000Z"));
    mocks.fetchSchedules.mockResolvedValue({
      data: [
        {
          id: "schedule-1",
          user_id: "user-1",
          hour: 14,
          timezone: "UTC",
          message: "Keep going",
          last_sent_local_date: null,
        },
      ],
      error: null,
    });
    mocks.claimSchedule.mockResolvedValue({
      data: { id: "schedule-1" },
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/api/push/dispatch", {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret",
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      due: 1,
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
  });
});
