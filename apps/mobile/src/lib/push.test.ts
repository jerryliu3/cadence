import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constants: {
    easConfig: null as { projectId?: string } | null,
    expoConfig: { extra: { eas: {} as { projectId?: string } } },
  },
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  postJson: vi.fn(),
  requestJson: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  unregisterForNotificationsAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
}));

vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: mocks.setNotificationHandler,
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  unregisterForNotificationsAsync: mocks.unregisterForNotificationsAsync,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
  },
}));
vi.mock("./api", () => ({
  api: {
    postJson: mocks.postJson,
    requestJson: mocks.requestJson,
  },
}));

import {
  isNativePushConfigured,
  registerNativePush,
  unregisterNativePush,
} from "./push";

describe("native push lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constants.easConfig = null;
    mocks.constants.expoConfig.extra.eas = {};
    mocks.getItem.mockResolvedValue(null);
    mocks.setItem.mockResolvedValue(undefined);
    mocks.removeItem.mockResolvedValue(undefined);
    mocks.postJson.mockResolvedValue({ success: true });
    mocks.requestJson.mockResolvedValue({ success: true });
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.getExpoPushTokenAsync.mockResolvedValue({
      data: "ExponentPushToken[device]",
    });
    mocks.unregisterForNotificationsAsync.mockResolvedValue(undefined);
  });

  it("rejects an unconfigured build before requesting permission", async () => {
    expect(isNativePushConfigured()).toBe(false);

    await expect(registerNativePush()).rejects.toThrow(
      "Push is not configured for this build."
    );

    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("persists the registered platform and token after the server accepts it", async () => {
    mocks.constants.easConfig = { projectId: "project-id" };

    await expect(registerNativePush()).resolves.toBe(
      "ExponentPushToken[device]"
    );

    expect(mocks.postJson).toHaveBeenCalledWith("/api/push/subscriptions", {
      platform: "ios",
      token: "ExponentPushToken[device]",
    });
    expect(mocks.setItem).toHaveBeenCalledWith(
      "cadence.native-push-registration",
      JSON.stringify({
        platform: "ios",
        token: "ExponentPushToken[device]",
      })
    );
    expect(mocks.postJson.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setItem.mock.invocationCallOrder[0]!
    );
  });

  it("deletes the server subscription before invalidating and clearing locally", async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify({
        platform: "android",
        token: "ExponentPushToken[stored]",
      })
    );

    await unregisterNativePush();

    expect(mocks.requestJson).toHaveBeenCalledWith({
      path: "/api/push/subscriptions",
      method: "DELETE",
      body: {
        platform: "android",
        token: "ExponentPushToken[stored]",
      },
    });
    expect(mocks.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
    expect(mocks.removeItem).toHaveBeenCalledWith(
      "cadence.native-push-registration"
    );
    expect(mocks.requestJson.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.unregisterForNotificationsAsync.mock.invocationCallOrder[0]!
    );
  });

  it("still invalidates and clears locally when server cleanup fails", async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify({
        platform: "ios",
        token: "ExponentPushToken[stored]",
      })
    );
    mocks.requestJson.mockRejectedValue(new Error("server details"));

    await expect(unregisterNativePush()).rejects.toThrow(
      "Could not fully unregister push notifications."
    );

    expect(mocks.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
    expect(mocks.removeItem).toHaveBeenCalledOnce();
  });
});
