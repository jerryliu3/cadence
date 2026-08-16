import {
  defaultNotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationPreferencesSection } from "./notification-preferences-section";

describe("NotificationPreferencesSection", () => {
  it("renders retry state when preferences are unavailable", () => {
    const onRetryLoad = vi.fn();

    render(
      <NotificationPreferencesSection
        preferences={defaultNotificationPreferences}
        loadingPreferences={false}
        hasLoadedPreferences={false}
        loadErrorMessage="Could not load"
        savingPreferenceKey={null}
        onRetryLoad={onRetryLoad}
        onTogglePreference={vi.fn()}
      />
    );

    expect(screen.getByText("Could not load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryLoad).toHaveBeenCalledOnce();
  });

  it("renders category toggles when preferences load successfully", () => {
    const onTogglePreference = vi.fn();

    render(
      <NotificationPreferencesSection
        preferences={{
          ...defaultNotificationPreferences,
          team_updates: false,
        }}
        loadingPreferences={false}
        hasLoadedPreferences
        loadErrorMessage={null}
        savingPreferenceKey={null}
        onRetryLoad={vi.fn()}
        onTogglePreference={onTogglePreference}
      />
    );

    const teamUpdates = screen.getByRole("checkbox", { name: /Team updates/i });
    expect(teamUpdates).not.toBeChecked();
    fireEvent.click(teamUpdates);
    expect(onTogglePreference).toHaveBeenCalledWith("team_updates", true);
  });
});
