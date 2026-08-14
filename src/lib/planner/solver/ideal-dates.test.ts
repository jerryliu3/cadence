import { describe, expect, it } from "vitest";
import {
  computeCadenceIdealDate,
  computeLifetimeIdealDate,
} from "./ideal-dates";

describe("computeLifetimeIdealDate", () => {
  it("places each ordinal inside its proportional lifetime segment", () => {
    const candidateDates = Array.from({ length: 12 }, (_, index) =>
      `2026-08-${String(index + 1).padStart(2, "0")}`
    );

    const dates = [1, 2, 3].map((ordinal) =>
      computeLifetimeIdealDate({
        goalId: "goal-a",
        ordinal,
        targetCount: 3,
        remainingLifetime: { start: "2026-08-01", end: "2026-08-12" },
        candidateDates,
      })
    );

    expect(dates[0]! >= "2026-08-01" && dates[0]! <= "2026-08-04").toBe(
      true
    );
    expect(dates[1]! >= "2026-08-05" && dates[1]! <= "2026-08-08").toBe(
      true
    );
    expect(dates[2]! >= "2026-08-09" && dates[2]! <= "2026-08-12").toBe(
      true
    );
  });

  it("snaps an unavailable target to the nearest valid candidate, preferring earlier ties", () => {
    const result = computeLifetimeIdealDate({
      goalId: "goal-a",
      ordinal: 1,
      targetCount: 1,
      remainingLifetime: { start: "2026-08-16", end: "2026-08-16" },
      candidateDates: ["2026-08-15", "2026-08-17"],
    });

    expect(result).toBe("2026-08-15");
    expect(result).not.toBe("2026-08-16");
  });

  it("is deterministic for candidate input order and returns null without candidates", () => {
    const parameters = {
      goalId: "goal-a",
      ordinal: 2,
      targetCount: 3,
      remainingLifetime: { start: "2026-08-01", end: "2026-08-31" },
    };

    expect(
      computeLifetimeIdealDate({
        ...parameters,
        candidateDates: ["2026-08-20", "2026-08-10", "2026-08-15"],
      })
    ).toBe(
      computeLifetimeIdealDate({
        ...parameters,
        candidateDates: ["2026-08-15", "2026-08-20", "2026-08-10"],
      })
    );
    expect(
      computeLifetimeIdealDate({ ...parameters, candidateDates: [] })
    ).toBeNull();
  });
});

describe("computeCadenceIdealDate", () => {
  it("selects a deterministic candidate from the cadence period", () => {
    const parameters = {
      goalId: "goal-a",
      periodKey: "weekly:2026-08-03",
    };
    const first = computeCadenceIdealDate({
      ...parameters,
      candidateDates: ["2026-08-05", "2026-08-03", "2026-08-04"],
    });
    const second = computeCadenceIdealDate({
      ...parameters,
      candidateDates: ["2026-08-04", "2026-08-05", "2026-08-03"],
    });

    expect(first).toBe(second);
    expect(["2026-08-03", "2026-08-04", "2026-08-05"]).toContain(first);
  });
});
