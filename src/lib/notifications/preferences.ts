import {
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  notificationPreferencesSchema,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { z } from "zod";

export {
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  notificationPreferencesSchema,
  type NotificationPreferences,
};

export const notificationPreferencesRequestSchema = z
  .object({
    notificationPreferences: notificationPreferencesSchema,
  })
  .strict();

export interface NotificationPreferencesResponsePayload {
  notificationPreferences: NotificationPreferences;
}
