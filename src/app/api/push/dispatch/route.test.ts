// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  fetchSchedules: vi.fn(),
  from: vi.fn(),
  reportError: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: vi.fn(),
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

    mocks.from.mockImplementation((table: string) => {
      if (table !== "notification_schedules") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: () => ({
          eq: mocks.fetchSchedules,
        }),
      };
    });
  });

  it("returns authentication_required for missing auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/push/dispatch", { method: "GET" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
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
});
