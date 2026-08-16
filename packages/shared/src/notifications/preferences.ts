import { z } from "zod";

export const notificationPreferenceKeys = [
  "daily_reminders",
  "team_updates",
  "partner_activity",
] as const;

export type NotificationPreferenceKey = (typeof notificationPreferenceKeys)[number];

export const notificationPreferencesSchema = z
  .object({
    daily_reminders: z.boolean(),
    team_updates: z.boolean(),
    partner_activity: z.boolean(),
  })
  .strict();

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const defaultNotificationPreferences: NotificationPreferences = {
  daily_reminders: true,
  team_updates: true,
  partner_activity: true,
};

export interface NotificationPreferenceCategory {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}

export const notificationPreferenceCategories: readonly NotificationPreferenceCategory[] = [
  {
    key: "daily_reminders",
    label: "Daily reminders",
    description: "Checklist reminder schedules sent in your local timezone.",
  },
  {
    key: "team_updates",
    label: "Team updates",
    description: "Team invite, invite accepted, and team dissolved notifications.",
  },
  {
    key: "partner_activity",
    label: "Partner activity",
    description: "Partner nudges and reactions to your social activity.",
  },
];

const managedOutboxNotificationKindToPreferenceKey = {
  team_invite: "team_updates",
  team_accepted: "team_updates",
  team_dissolved: "team_updates",
  nudge: "partner_activity",
  reaction: "partner_activity",
} as const;

type ManagedOutboxNotificationKind = keyof typeof managedOutboxNotificationKindToPreferenceKey;

function readBooleanOrDefault(
  value: unknown,
  defaultValue: boolean
): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const parsed = notificationPreferencesSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const partial =
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;

  return {
    daily_reminders: readBooleanOrDefault(
      partial?.daily_reminders,
      defaultNotificationPreferences.daily_reminders
    ),
    team_updates: readBooleanOrDefault(
      partial?.team_updates,
      defaultNotificationPreferences.team_updates
    ),
    partner_activity: readBooleanOrDefault(
      partial?.partner_activity,
      defaultNotificationPreferences.partner_activity
    ),
  };
}

export function getNotificationPreferenceKeyForOutboxKind(
  kind: string
): NotificationPreferenceKey | null {
  return (
    managedOutboxNotificationKindToPreferenceKey[
      kind as ManagedOutboxNotificationKind
    ] ?? null
  );
}
