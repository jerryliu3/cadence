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
      start: "0099-02-01",
      end: "0099-02-28",
    });
  });

  it("anchors monthly periods to calendar month boundaries", () => {
    expect(getAnchoredPeriod("2026-01-31", "monthly", "2026-02-27")).toMatchObject({
      index: 1,
      start: "2026-02-01",
      end: "2026-02-28",
      nextStart: "2026-03-01",
      periodKey: "2026-02-01",
    });
    expect(getAnchoredPeriodStart("2026-01-31", "monthly", 0)).toBe("2026-01-01");
    expect(getAnchoredPeriodStart("2026-01-31", "monthly", 2)).toBe("2026-03-01");
  });

  it("uses weekStartsOn as the only weekly boundary source", () => {
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-12", {
        weekStartsOn: 4,
      })
    ).toMatchObject({
      index: 0,
      start: "2026-08-06",
      end: "2026-08-12",
      nextStart: "2026-08-13",
    });
    expect(
      getAnchoredPeriod("2026-08-06", "weekly", "2026-08-12", {
        weekStartsOn: 1,
      })
    ).toMatchObject({
      index: 1,
      start: "2026-08-10",
      end: "2026-08-16",
      nextStart: "2026-08-17",
    });
  });

  it("keeps weekly period indices monotonic by calendar-week boundaries", () => {
    const first = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-12", {
      weekStartsOn: 4,
    });
    const second = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-13", {
      weekStartsOn: 4,
    });
    const third = getAnchoredPeriod("2026-08-06", "weekly", "2026-08-20", {
      weekStartsOn: 4,
    });
    expect(first.index).toBe(0);
    expect(second.index).toBe(1);
    expect(third.index).toBe(2);
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

  it("clamps references before the anchor to period index zero", () => {
    expect(
      getAnchoredPeriod("2026-08-10", "monthly", "2026-08-01")
    ).toMatchObject({
      index: 0,
      start: "2026-08-01",
      end: "2026-08-31",
    });
    expect(
      getAnchoredPeriod("2026-08-10", "weekly", "2026-08-05", {
        weekStartsOn: 1,
      })
    ).toMatchObject({
      index: 0,
      start: "2026-08-10",
      end: "2026-08-16",
    });
  });

  it("performs date arithmetic without host-timezone conversion", () => {
    expect(addDaysToDateString("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToDateString("2024-02-29", 1)).toBe("2024-03-01");
  });
});
