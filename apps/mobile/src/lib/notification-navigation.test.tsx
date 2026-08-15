import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  getLastResponse: vi.fn(),
  clearLastResponse: vi.fn(),
  push: vi.fn(),
  remove: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: mocks.addListener,
  getLastNotificationResponseAsync: mocks.getLastResponse,
  clearLastNotificationResponseAsync: mocks.clearLastResponse,
}));
vi.mock("expo-router", () => ({
  router: { push: mocks.push },
}));
vi.mock("./session", () => ({
  useSession: mocks.useSession,
}));

import {
  NotificationNavigation,
  normalizeNotificationPath,
} from "./notification-navigation";

describe("notification navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addListener.mockReturnValue({ remove: mocks.remove });
    mocks.getLastResponse.mockResolvedValue(null);
    mocks.clearLastResponse.mockResolvedValue(undefined);
    mocks.useSession.mockReturnValue({
      ready: true,
      session: { user: { id: "user-1" } },
    });
  });

  it("accepts same-app paths and rejects external or traversal paths", () => {
    expect(normalizeNotificationPath(undefined)).toBe("/");
    expect(normalizeNotificationPath("/checklist?from=push")).toBe(
      "/checklist?from=push"
    );
    expect(normalizeNotificationPath("https://evil.example")).toBeNull();
    expect(normalizeNotificationPath("//evil.example")).toBeNull();
    expect(normalizeNotificationPath("/../settings")).toBeNull();
  });

  it("handles and clears a cold-start response after a session exists", async () => {
    mocks.getLastResponse.mockResolvedValue({
      notification: {
        request: {
          content: { data: { url: "/calendar" } },
        },
      },
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(<NotificationNavigation />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.push).toHaveBeenCalledWith("/calendar");
    expect(mocks.clearLastResponse).toHaveBeenCalledOnce();

    act(() => renderer?.unmount());
  });
});
