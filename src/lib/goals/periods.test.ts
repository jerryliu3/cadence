import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  getAnchoredPeriod,
  getAnchoredPeriodStart,
} from "./periods";

describe("anchored civil-date periods", () => {
  it("handles ISO years below 0100 without remapping them to 1900", () => {
    expect(addDaysToDateString("0099-12-31", 1)).toBe("0100-01-01");
    expect(
      getAnchoredPeriod("0099-01-31", "monthly", "0099-02-28")
    ).toMatchObject({
      start: "0099-02-28",
      end: "0099-03-30",
    });
  });

  it.each([
    ["2026-01-29", "2026-02-27", "2026-01-29", "2026-02-27", "2026-02-28"],
    ["2026-01-30", "2026-02-27", "2026-01-30", "2026-02-27", "2026-02-28"],
    ["2026-01-31", "2026-02-27", "2026-01-31", "2026-02-27", "2026-02-28"],
    ["2026-01-31", "2026-02-28", "2026-02-28", "2026-03-30", "2026-03-31"],
    ["2026-01-31", "2026-03-31", "2026-03-31", "2026-04-29", "2026-04-30"],
  ])(
    "keeps the original monthly anchor for %s at %s",
    (anchor, reference, start, end, nextStart) => {
      expect(getAnchoredPeriod(anchor, "monthly", reference)).toMatchObject({
        start,
        end,
        nextStart,
      });
    }
  );

  it("handles leap-year gap days from the original anchor", () => {
    expect(getAnchoredPeriodStart("2024-01-31", "monthly", 1)).toBe(
      "2024-02-29"
    );
    expect(getAnchoredPeriodStart("2024-01-31", "monthly", 2)).toBe(
      "2024-03-31"
    );
    expect(
      getAnchoredPeriod("2024-01-31", "monthly", "2024-02-29")
    ).toMatchObject({
      index: 1,
      start: "2024-02-29",
      end: "2024-03-30",
    });
  });

  it("uses inclusive weekly boundaries anchored to the start date", () => {
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-12")
    ).toMatchObject({
      index: 0,
      start: "2026-08-06",
      end: "2026-08-12",
      nextStart: "2026-08-13",
    });
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-13")
    ).toMatchObject({
      index: 1,
      start: "2026-08-13",
    });
  });

  it("keeps pre-cutover weekly periods on the legacy anchor", () => {
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-16", {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-17",
        },
      })
    ).toMatchObject({
      index: 1,
      start: "2026-08-13",
      end: "2026-08-16",
      nextStart: "2026-08-17",
    });
  });

  it("switches to weekStartsOn-aligned weekly periods on and after cutover", () => {
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-18", {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-17",
        },
      })
    ).toMatchObject({
      index: 2,
      start: "2026-08-17",
      end: "2026-08-23",
      nextStart: "2026-08-24",
      periodKey: "2026-08-17",
    });
  });

  it("normalizes non-week-aligned cutover dates to the next week boundary", () => {
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-18", {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-12",
        },
      })
    ).toMatchObject({
      index: 2,
      start: "2026-08-17",
      end: "2026-08-23",
      periodKey: "2026-08-17",
    });
    expect(
      getAnchoredPeriodStart("2026-08-20", "weekly", 0, {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-13",
        },
      })
    ).toBe("2026-08-17");
  });

  it("keeps period indices monotonic across the cutover seam", () => {
    const before = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-16", {
      weekly: {
        weekStartsOn: 1,
        effectiveFrom: "2026-08-17",
      },
    });
    const atCutover = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-17", {
      weekly: {
        weekStartsOn: 1,
        effectiveFrom: "2026-08-17",
      },
    });
    const after = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-24", {
      weekly: {
        weekStartsOn: 1,
        effectiveFrom: "2026-08-17",
      },
    });

    expect(before.index).toBe(1);
    expect(atCutover.index).toBe(2);
    expect(after.index).toBe(3);
  });

  it("treats cutovers before start_date as week-aligned from index zero", () => {
    expect(
      getAnchoredPeriodStart("2026-08-20", "weekly", 0, {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-11",
        },
      })
    ).toBe("2026-08-17");
    expect(
      getAnchoredPeriod("2026-08-20", "weekly", "2026-08-20", {
        weekly: {
          weekStartsOn: 1,
          effectiveFrom: "2026-08-11",
        },
      })
    ).toMatchObject({
      index: 0,
      start: "2026-08-17",
      nextStart: "2026-08-24",
    });
  });

  it("treats each daily date as one stable period", () => {
    expect(
      getAnchoredPeriod("2026-08-01", "daily", "2026-08-04")
    ).toEqual({
      index: 3,
      start: "2026-08-04",
      end: "2026-08-04",
      nextStart: "2026-08-05",
      periodKey: "2026-08-04",
    });
  });

  it("clamps references before the anchor to the first period", () => {
    expect(
      getAnchoredPeriod("2026-08-10", "monthly", "2026-08-01")
    ).toMatchObject({
      index: 0,
      start: "2026-08-10",
    });
  });

  it("performs date arithmetic without host-timezone conversion", () => {
    expect(addDaysToDateString("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToDateString("2024-02-29", 1)).toBe("2024-03-01");
  });
});
