import { describe, expect, it } from "vitest";
import { getDateInTimezone, isValidIanaTimezone } from "./timezone";

describe("IANA timezone dates", () => {
  it("derives calendar dates without a UTC fallback", () => {
    const instant = new Date("2026-01-31T11:30:00.000Z");

    expect(getDateInTimezone(instant, "America/Los_Angeles")).toBe(
      "2026-01-31"
    );
    expect(getDateInTimezone(instant, "Pacific/Auckland")).toBe("2026-02-01");
  });

  it("rejects invalid timezone identifiers", () => {
    expect(isValidIanaTimezone("Pacific/Auckland")).toBe(true);
    expect(isValidIanaTimezone("Mars/Olympus_Mons")).toBe(false);
  });
});
