// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  fetchSchedules: vi.fn(),
  claimSchedule: vi.fn(),
  fetchSubscriptions: vi.fn(),
  deleteSubscriptions: vi.fn(),
  from: vi.fn(),
  reportError: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
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

import { GET } from "./route";

describe("push dispatch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getServerEnv.mockReturnValue({
      CRON_SECRET: "cron-secret",
      VAPID_SUBJECT: "mailto:test@example.com",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
      VAPID_PRIVATE_KEY: "private-key",
    });

    mocks.fetchSchedules.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.claimSchedule.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.fetchSubscriptions.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.deleteSubscriptions.mockResolvedValue({
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "notification_schedules") {
        return {
          select: () => ({
            eq: mocks.fetchSchedules,
          }),
          update: () => ({
            eq: () => ({
              or: () => ({
                select: () => ({
                  maybeSingle: mocks.claimSchedule,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: () => ({
            in: mocks.fetchSubscriptions,
          }),
          delete: () => ({
            in: mocks.deleteSubscriptions,
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

  it("returns push_dispatch_unavailable when cron is not configured", async () => {
    mocks.getServerEnv.mockReturnValue({
      CRON_SECRET: "",
      VAPID_SUBJECT: "mailto:test@example.com",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
      VAPID_PRIVATE_KEY: "private-key",
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

  it("returns push_configuration_invalid when VAPID keys are missing", async () => {
    mocks.getServerEnv.mockReturnValue({
      CRON_SECRET: "cron-secret",
      VAPID_SUBJECT: "",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
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
      code: "push_configuration_invalid",
      correlationId: expect.any(String),
    });
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

  it("returns success payload with correlation id when nothing is due", async () => {
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
  });

  it("keeps dispatch successful when downstream push delivery fails", async () => {
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
    mocks.fetchSubscriptions.mockResolvedValue({
      data: [
        {
          id: "sub-1",
          user_id: "user-1",
          endpoint: "https://example.test/sub-1",
          p256dh: "p256dh",
          auth: "auth",
        },
      ],
      error: null,
    });
    mocks.sendNotification.mockRejectedValue(new Error("push-provider-down"));

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
      removedSubscriptions: 0,
      correlationId: expect.any(String),
    });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });
});
