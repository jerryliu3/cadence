// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendPushToUser: vi.fn(),
  profileRows: [] as Array<{
    id: string;
    notification_preferences: Record<string, unknown>;
  }>,
  profileSelectError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: () => ({
          in: async () => ({
            data: mocks.profileRows,
            error: mocks.profileSelectError,
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: mocks.sendPushToUser,
}));

import { flushNotificationOutbox } from "./outbox";

describe("flushNotificationOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileSelectError = null;
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
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notification_outbox_service") {
        return {
          data: [
            {
              id: "outbox-1",
              user_id: "user-1",
              kind: "nudge",
              title: "New nudge",
              body: "Keep going",
              url: "/social",
              attempts: 1,
            },
          ],
          error: null,
        };
      }
      return { data: true, error: null };
    });
  });

  it("skips outbox rows when the user disabled that category", async () => {
    mocks.profileRows = [
      {
        id: "user-1",
        notification_preferences: {
          daily_reminders: true,
          team_updates: true,
          partner_activity: false,
        },
      },
    ];

    const result = await flushNotificationOutbox();

    expect(result).toMatchObject({
      claimed: 1,
      sent: 0,
      skipped: 1,
      failed: 0,
      deferred: 0,
    });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "resolve_notification_outbox_delivery_service",
      {
        p_outbox_id: "outbox-1",
        p_sent: false,
        p_error: "disabled_by_user_preference",
      }
    );
  });

  it("fails open when profile preference lookup fails", async () => {
    mocks.profileSelectError = { message: "profiles lookup unavailable" };
    mocks.sendPushToUser.mockResolvedValue({
      sent: 1,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 0,
    });

    const result = await flushNotificationOutbox();

    expect(result).toMatchObject({
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      deferred: 0,
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("defers unavailable web delivery without using a terminal failure code", async () => {
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: true,
      deliveryFailures: 0,
    });

    const result = await flushNotificationOutbox();

    expect(result).toMatchObject({
      claimed: 1,
      sent: 0,
      failed: 0,
      deferred: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "resolve_notification_outbox_delivery_service",
      {
        p_outbox_id: "outbox-1",
        p_sent: false,
        p_error: "web_configuration_unavailable",
      }
    );
  });

  it("fails the flush when configuration deferral cannot be persisted", async () => {
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: true,
      deliveryFailures: 0,
    });
    let resolveAttempts = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_notification_outbox_service") {
        return {
          data: [
            {
              id: "outbox-1",
              user_id: "user-1",
              kind: "nudge",
              title: "New nudge",
              body: "Keep going",
              url: "/social",
              attempts: 1,
            },
          ],
          error: null,
        };
      }
      resolveAttempts += 1;
      return resolveAttempts === 1
        ? {
            data: null,
            error: { message: "resolver unavailable" },
          }
        : { data: true, error: null };
    });

    await expect(flushNotificationOutbox()).rejects.toMatchObject({
      message: "resolver unavailable",
    });
    expect(resolveAttempts).toBe(1);
  });

  it("records remote delivery failures as normal failed attempts", async () => {
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: false,
      deliveryFailures: 1,
    });

    const result = await flushNotificationOutbox();

    expect(result).toMatchObject({
      claimed: 1,
      failed: 1,
      deferred: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "resolve_notification_outbox_delivery_service",
      {
        p_outbox_id: "outbox-1",
        p_sent: false,
        p_error: "send_failed",
      }
    );
  });
});
