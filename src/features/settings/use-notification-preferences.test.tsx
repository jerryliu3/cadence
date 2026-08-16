import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultNotificationPreferences } from "@cadence/shared/notifications/preferences";

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  putJson: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args) },
}));

vi.mock("@/lib/api/client", () => ({
  getJson: (...args: unknown[]) => mocks.getJson(...args),
  putJson: (...args: unknown[]) => mocks.putJson(...args),
  getApiErrorMessage: (_error: unknown, fallbackMessage: string) =>
    fallbackMessage,
}));

import { useNotificationPreferences } from "./use-notification-preferences";

describe("useNotificationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads preferences and clears the load error state", async () => {
    mocks.getJson.mockResolvedValue({
      notificationPreferences: {
        ...defaultNotificationPreferences,
        team_updates: false,
      },
    });
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await result.current.loadPreferences();
    });

    expect(mocks.getJson).toHaveBeenCalledWith("/api/notifications/preferences");
    expect(result.current.preferences.team_updates).toBe(false);
    expect(result.current.hasLoadedPreferences).toBe(true);
    expect(result.current.loadErrorMessage).toBeNull();
    expect(result.current.loadingPreferences).toBe(false);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("surfaces a load error when preferences cannot be fetched", async () => {
    mocks.getJson.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await result.current.loadPreferences();
    });

    expect(result.current.hasLoadedPreferences).toBe(false);
    expect(result.current.loadErrorMessage).toBe(
      "Notification category preferences could not be loaded."
    );
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Notification category preferences could not be loaded."
    );
  });

  it("rolls back optimistic state when saving fails", async () => {
    mocks.getJson.mockResolvedValue({
      notificationPreferences: defaultNotificationPreferences,
    });
    mocks.putJson.mockRejectedValue(new Error("save failed"));
    const { result } = renderHook(() => useNotificationPreferences());

    await act(async () => {
      await result.current.loadPreferences();
    });

    await act(async () => {
      await result.current.togglePreference("team_updates", false);
    });

    expect(mocks.putJson).toHaveBeenCalledWith("/api/notifications/preferences", {
      notificationPreferences: {
        ...defaultNotificationPreferences,
        team_updates: false,
      },
    });
    expect(result.current.preferences.team_updates).toBe(true);
    expect(result.current.savingPreferenceKey).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Notification category preferences could not be saved."
    );
  });
});
