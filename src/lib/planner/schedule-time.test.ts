import { describe, expect, it } from "vitest";
import {
  normalizePlannerLocalTime,
  resolvePlannerEffectiveScheduledTime,
} from "@/lib/planner/schedule-time";

describe("planner schedule time", () => {
  it("normalizes valid local times", () => {
    expect(normalizePlannerLocalTime("08:30")).toBe("08:30");
    expect(normalizePlannerLocalTime(" 23:59 ")).toBe("23:59");
  });

  it("returns null for empty or missing local times", () => {
    expect(normalizePlannerLocalTime("")).toBeNull();
    expect(normalizePlannerLocalTime("   ")).toBeNull();
    expect(normalizePlannerLocalTime(null)).toBeNull();
    expect(normalizePlannerLocalTime(undefined)).toBeNull();
  });

  it("rejects invalid local times", () => {
    expect(() => normalizePlannerLocalTime("24:00")).toThrow();
    expect(() => normalizePlannerLocalTime("7:00")).toThrow();
    expect(() => normalizePlannerLocalTime("09:99")).toThrow();
  });

  it("resolves explicit item overrides", () => {
    const resolved = resolvePlannerEffectiveScheduledTime({
      scheduledDate: "2026-08-08",
      scheduledTimeOverride: "19:30",
    });
    expect(resolved).toEqual({
      scheduledTimeOverride: "19:30",
      effectiveScheduledLocalTime: "19:30",
      effectiveScheduledAtLocal: "2026-08-08T19:30:00",
    });
  });

  it("preserves date-only semantics when no override exists", () => {
    expect(
      resolvePlannerEffectiveScheduledTime({
        scheduledDate: "2026-08-08",
        scheduledTimeOverride: null,
      })
    ).toMatchObject({
      effectiveScheduledLocalTime: null,
      effectiveScheduledAtLocal: null,
    });
  });
});
