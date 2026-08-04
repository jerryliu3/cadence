// @vitest-environment node

import { describe, expect, it } from "vitest";

const expectedLocalDateByTimezone: Record<string, string> = {
  "America/Los_Angeles": "2026-01-31",
  "Pacific/Auckland": "2026-02-01",
};

function formatLocalDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

describe("timezone process harness", () => {
  it("runs with the requested process timezone", () => {
    const timezone = process.env.TZ;
    const resolvedTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (timezone && expectedLocalDateByTimezone[timezone]) {
      expect(resolvedTimezone).toBe(timezone);
      expect(formatLocalDate(new Date("2026-01-31T11:00:00.000Z"))).toBe(
        expectedLocalDateByTimezone[timezone]
      );
      return;
    }

    expect(resolvedTimezone.length).toBeGreaterThan(0);
  });
});
