"use client";

import {
  notificationPreferenceCategories,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface NotificationPreferencesSectionProps {
  preferences: NotificationPreferences;
  loadingPreferences: boolean;
  hasLoadedPreferences: boolean;
  loadErrorMessage: string | null;
  savingPreferenceKey: NotificationPreferenceKey | null;
  onRetryLoad: () => void;
  onTogglePreference: (key: NotificationPreferenceKey, enabled: boolean) => void;
}

export function NotificationPreferencesSection({
  preferences,
  loadingPreferences,
  hasLoadedPreferences,
  loadErrorMessage,
  savingPreferenceKey,
  onRetryLoad,
  onTogglePreference,
}: NotificationPreferencesSectionProps) {
  if (!loadingPreferences && !hasLoadedPreferences) {
    return (
      <section className="space-y-4 border-t pt-5">
        <div>
          <h3 className="text-base font-medium">Notification categories</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which categories can trigger push notifications across your devices.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            {loadErrorMessage ??
              "Notification categories are temporarily unavailable. Retry to load your saved settings."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryLoad}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 border-t pt-5">
      <div>
        <h3 className="text-base font-medium">Notification categories</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which categories can trigger push notifications across your devices.
        </p>
      </div>
      <div className="space-y-2">
        {notificationPreferenceCategories.map((category) => {
          const pending = loadingPreferences || savingPreferenceKey !== null;

          return (
            <Label
              key={category.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-border"
                checked={preferences[category.key]}
                disabled={pending}
                onChange={(event) =>
                  onTogglePreference(category.key, event.target.checked)
                }
              />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">{category.label}</p>
                <p className="text-xs text-muted-foreground">{category.description}</p>
              </div>
            </Label>
          );
        })}
      </div>
    </section>
  );
}
