import { describe, expect, it } from "vitest";
import { createDefaultPlannerPolicy } from "./policy";
import {
  parsePlannerLegacyPreferencesRow,
  resolvePlannerPreferencesSnapshot,
} from "./preferences-snapshot";

const confirmedAt = "2026-08-07T00:00:00.000Z";

describe("resolvePlannerPreferencesSnapshot", () => {
  it("returns null while timezone confirmation is still pending", () => {
    const snapshot = resolvePlannerPreferencesSnapshot({
      profile: {
        timezone: "UTC",
        timezone_confirmed_at: null,
        week_starts_on: 1,
        rest_weekdays: [],
        blackout_ranges: [],
      },
      legacy: null,
    });

    expect(snapshot).toBeNull();
  });

  it("keeps legacy policy fields while profile-owned fields win", () => {
    const legacyPolicy = {
      ...createDefaultPlannerPolicy("America/New_York", confirmedAt),
      spacingStrategy: "front_load" as const,
      goalSpacingStrategies: { strength: "even" as const },
      weekStartsOn: 6,
      restWeekdays: [6],
      blackoutRanges: [{ start: "2026-08-10", end: "2026-08-11" }],
    };

    const snapshot = resolvePlannerPreferencesSnapshot({
      profile: {
        timezone: "America/New_York",
        timezone_confirmed_at: confirmedAt,
        week_starts_on: 2,
        rest_weekdays: [5, 2, 5],
        blackout_ranges: [{ start: "2026-08-20", end: "2026-08-21" }],
      },
      legacy: {
        timezone: "America/New_York",
        timezone_confirmed_at: confirmedAt,
        policy_revision: 4,
        default_policy: legacyPolicy,
      },
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.policy_revision).toBe(4);
    expect(snapshot?.default_policy.spacingStrategy).toBe("front_load");
    expect(snapshot?.default_policy.weekStartsOn).toBe(2);
    expect(snapshot?.default_policy.restWeekdays).toEqual([2, 5]);
    expect(snapshot?.default_policy.blackoutRanges).toEqual([
      { start: "2026-08-20", end: "2026-08-21" },
    ]);
  });

  it("uses policy revision 1 when no legacy row exists", () => {
    const snapshot = resolvePlannerPreferencesSnapshot({
      profile: {
        timezone: "UTC",
        timezone_confirmed_at: confirmedAt,
        week_starts_on: 1,
        rest_weekdays: [],
        blackout_ranges: [],
      },
      legacy: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.policy_revision).toBe(1);
  });
});

describe("parsePlannerLegacyPreferencesRow", () => {
  it("rejects policy revision zero", () => {
    expect(() =>
      parsePlannerLegacyPreferencesRow({
        timezone: "UTC",
        timezone_confirmed_at: confirmedAt,
        policy_revision: 0,
        default_policy: createDefaultPlannerPolicy("UTC", confirmedAt),
      })
    ).toThrow();
  });
});
