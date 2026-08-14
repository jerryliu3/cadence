import { describe, expect, it } from "vitest";
import {
  addUtcDays,
  healthUtcOffsetEnvelope,
  isHealthLocalDateInLookback,
  isHealthLocalTodayInEnvelope,
} from "@cadence/shared/health/sync-window";

describe("health sync window", () => {
  it("keeps UTC today inside the offset envelope", () => {
    const now = new Date("2026-08-14T16:00:00.000Z");
    const utcToday = "2026-08-14";
    expect(isHealthLocalTodayInEnvelope(utcToday, now)).toBe(true);
    expect(isHealthLocalTodayInEnvelope("2099-06-15", now)).toBe(false);
  });

  it("treats today and yesterday as the autocomplete lookback", () => {
    expect(isHealthLocalDateInLookback("2026-08-14", "2026-08-14")).toBe(true);
    expect(isHealthLocalDateInLookback("2026-08-13", "2026-08-14")).toBe(true);
    expect(isHealthLocalDateInLookback("2026-08-12", "2026-08-14")).toBe(false);
    expect(addUtcDays("2026-08-14", -1)).toBe("2026-08-13");
  });

  it("spans at most one calendar day on each side of UTC now", () => {
    const envelope = healthUtcOffsetEnvelope(
      new Date("2026-08-14T23:30:00.000Z")
    );
    expect(envelope.min <= "2026-08-14").toBe(true);
    expect(envelope.max >= "2026-08-14").toBe(true);
    expect(envelope.max <= "2026-08-15").toBe(true);
  });
});
