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
