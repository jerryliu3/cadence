import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences,
  getNotificationPreferenceKeyForOutboxKind,
  normalizeNotificationPreferences,
} from "./preferences";

describe("normalizeNotificationPreferences", () => {
  it("returns defaults for invalid payloads", () => {
    expect(normalizeNotificationPreferences(null)).toEqual(
      defaultNotificationPreferences
    );
    expect(normalizeNotificationPreferences({ daily_reminders: "yes" })).toEqual(
      defaultNotificationPreferences
    );
  });

  it("merges partial persisted payloads with defaults", () => {
    expect(
      normalizeNotificationPreferences({
        daily_reminders: false,
      })
    ).toEqual({
      daily_reminders: false,
      team_updates: true,
      partner_activity: true,
    });
  });
});

describe("getNotificationPreferenceKeyForOutboxKind", () => {
  it("maps supported outbox kinds to category keys", () => {
    expect(getNotificationPreferenceKeyForOutboxKind("team_invite")).toBe(
      "team_updates"
    );
    expect(getNotificationPreferenceKeyForOutboxKind("nudge")).toBe(
      "partner_activity"
    );
  });

  it("returns null for non-configured kinds", () => {
    expect(getNotificationPreferenceKeyForOutboxKind("planner_proposal")).toBe(
      null
    );
  });
});
