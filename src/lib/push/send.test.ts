// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
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

import {
  readExpoPushTickets,
  isExpiredExpoPushTicket,
  resetWebPushConfigurationForTests,
  sendPushToUser,
} from "./send";

function createAdmin({
  rows,
}: {
  rows: Array<Record<string, unknown>>;
}) {
  const deletedIds: string[][] = [];
  return {
    deletedIds,
    from: (table: string) => {
      if (table !== "push_subscriptions") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: async () => ({ data: rows, error: null }),
        }),
        delete: () => ({
          in: async (_column: string, ids: string[]) => {
            deletedIds.push(ids);
            return { error: null };
          },
        }),
      };
    },
  };
}

describe("sendPushToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebPushConfigurationForTests();
    mocks.getServerEnv.mockReturnValue({
      VAPID_SUBJECT: "mailto:test@example.com",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
      VAPID_PRIVATE_KEY: "private-key",
      EXPO_ACCESS_TOKEN: "expo-token",
    });
    mocks.sendNotification.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "ok", id: "ticket-1" } }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses Expo tickets and treats DeviceNotRegistered as expired", () => {
    const tickets = readExpoPushTickets({
      data: {
        status: "error",
        details: { error: "DeviceNotRegistered" },
      },
    });
    expect(tickets).toHaveLength(1);
    expect(isExpiredExpoPushTicket(tickets[0]!)).toBe(true);
  });

  it("sends native Expo push without requiring VAPID", async () => {
    mocks.getServerEnv.mockReturnValue({
      EXPO_ACCESS_TOKEN: "expo-token",
    });
    const admin = createAdmin({
      rows: [
        {
          id: "native-1",
          endpoint: "native:ios:token-1",
          p256dh: null,
          auth: null,
          platform: "ios",
          native_token: "ExponentPushToken[abc]",
        },
      ],
    });

    const result = await sendPushToUser({
      admin: admin as never,
      userId: "user-1",
      payload: { title: "Goalmaxxing", body: "Keep going" },
    });

    expect(result).toEqual({
      sent: 1,
      removedSubscriptions: 0,
      hadSubscriptions: true,
    });
    expect(mocks.setVapidDetails).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("removes DeviceNotRegistered native tokens and continues the batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            status: "error",
            details: { error: "DeviceNotRegistered" },
          },
        }),
      })
    );
    mocks.sendNotification.mockRejectedValue(new Error("web-push-down"));
    const admin = createAdmin({
      rows: [
        {
          id: "native-1",
          endpoint: "native:ios:token-1",
          platform: "ios",
          native_token: "ExponentPushToken[old]",
          p256dh: null,
          auth: null,
        },
        {
          id: "web-1",
          endpoint: "https://example.test/sub",
          platform: "web",
          p256dh: "p256dh",
          auth: "auth",
        },
      ],
    });

    const result = await sendPushToUser({
      admin: admin as never,
      userId: "user-1",
      payload: { title: "Goalmaxxing", body: "Keep going" },
    });

    expect(result.sent).toBe(0);
    expect(result.removedSubscriptions).toBe(1);
    expect(admin.deletedIds).toEqual([["native-1"]]);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("skips web subscriptions when VAPID is missing instead of aborting native send", async () => {
    mocks.getServerEnv.mockReturnValue({
      EXPO_ACCESS_TOKEN: "expo-token",
    });
    const admin = createAdmin({
      rows: [
        {
          id: "web-1",
          endpoint: "https://example.test/sub",
          platform: "web",
          p256dh: "p256dh",
          auth: "auth",
        },
        {
          id: "native-1",
          endpoint: "native:android:token-1",
          platform: "android",
          native_token: "ExponentPushToken[abc]",
          p256dh: null,
          auth: null,
        },
      ],
    });

    const result = await sendPushToUser({
      admin: admin as never,
      userId: "user-1",
      payload: { title: "Goalmaxxing", body: "Keep going" },
    });

    expect(result.sent).toBe(1);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
