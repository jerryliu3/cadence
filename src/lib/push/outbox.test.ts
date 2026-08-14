// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: mocks.sendPushToUser,
}));

import { flushNotificationOutbox } from "./outbox";

describe("flushNotificationOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("defers unavailable web delivery without using a terminal failure code", async () => {
    mocks.sendPushToUser.mockResolvedValue({
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: true,
      webConfigurationUnavailable: true,
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
    });
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
      return {
        data: null,
        error: { message: "resolver unavailable" },
      };
    });

    await expect(flushNotificationOutbox()).rejects.toMatchObject({
      message: "resolver unavailable",
    });
  });
});
