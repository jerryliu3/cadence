import { describe, expect, it } from "vitest";
import { getAnchoredPeriod } from "@/lib/goals/periods";

const FIXTURES: Array<{
  anchorDate: string;
  interval: "daily" | "weekly" | "monthly";
  referenceDate: string;
  expectedPeriodStart: string;
}> = [
  { anchorDate: "2026-01-01", interval: "daily", referenceDate: "2026-01-01", expectedPeriodStart: "2026-01-01" },
  { anchorDate: "2026-01-01", interval: "daily", referenceDate: "2026-01-02", expectedPeriodStart: "2026-01-02" },
  { anchorDate: "2026-01-01", interval: "daily", referenceDate: "2026-01-31", expectedPeriodStart: "2026-01-31" },
  { anchorDate: "2024-02-28", interval: "daily", referenceDate: "2024-02-29", expectedPeriodStart: "2024-02-29" },
  { anchorDate: "2025-12-31", interval: "daily", referenceDate: "2026-01-01", expectedPeriodStart: "2026-01-01" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-06", expectedPeriodStart: "2026-08-06" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-07", expectedPeriodStart: "2026-08-06" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-12", expectedPeriodStart: "2026-08-06" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-13", expectedPeriodStart: "2026-08-13" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-19", expectedPeriodStart: "2026-08-13" },
  { anchorDate: "2026-08-06", interval: "weekly", referenceDate: "2026-08-20", expectedPeriodStart: "2026-08-20" },
  { anchorDate: "2026-12-30", interval: "weekly", referenceDate: "2027-01-01", expectedPeriodStart: "2026-12-30" },
  { anchorDate: "2026-12-30", interval: "weekly", referenceDate: "2027-01-05", expectedPeriodStart: "2026-12-30" },
  { anchorDate: "2026-12-30", interval: "weekly", referenceDate: "2027-01-06", expectedPeriodStart: "2027-01-06" },
  { anchorDate: "2024-01-31", interval: "monthly", referenceDate: "2024-01-31", expectedPeriodStart: "2024-01-31" },
  { anchorDate: "2024-01-31", interval: "monthly", referenceDate: "2024-02-28", expectedPeriodStart: "2024-01-31" },
  { anchorDate: "2024-01-31", interval: "monthly", referenceDate: "2024-02-29", expectedPeriodStart: "2024-02-29" },
  { anchorDate: "2024-01-31", interval: "monthly", referenceDate: "2024-03-28", expectedPeriodStart: "2024-02-29" },
  { anchorDate: "2024-01-31", interval: "monthly", referenceDate: "2024-03-29", expectedPeriodStart: "2024-02-29" },
  { anchorDate: "2025-01-31", interval: "monthly", referenceDate: "2025-02-27", expectedPeriodStart: "2025-01-31" },
  { anchorDate: "2025-01-31", interval: "monthly", referenceDate: "2025-02-28", expectedPeriodStart: "2025-02-28" },
  { anchorDate: "2025-01-31", interval: "monthly", referenceDate: "2025-03-30", expectedPeriodStart: "2025-02-28" },
  { anchorDate: "2025-01-31", interval: "monthly", referenceDate: "2025-03-31", expectedPeriodStart: "2025-03-31" },
  { anchorDate: "2025-01-30", interval: "monthly", referenceDate: "2025-02-27", expectedPeriodStart: "2025-01-30" },
  { anchorDate: "2025-01-30", interval: "monthly", referenceDate: "2025-02-28", expectedPeriodStart: "2025-02-28" },
  { anchorDate: "2025-01-30", interval: "monthly", referenceDate: "2025-03-29", expectedPeriodStart: "2025-02-28" },
  { anchorDate: "2025-01-30", interval: "monthly", referenceDate: "2025-03-30", expectedPeriodStart: "2025-03-30" },
  { anchorDate: "2025-11-30", interval: "monthly", referenceDate: "2025-12-29", expectedPeriodStart: "2025-11-30" },
  { anchorDate: "2025-11-30", interval: "monthly", referenceDate: "2025-12-30", expectedPeriodStart: "2025-12-30" },
  { anchorDate: "2025-11-30", interval: "monthly", referenceDate: "2026-01-30", expectedPeriodStart: "2026-01-30" },
];

describe("period key parity fixtures", () => {
  it("matches SQL fixture period starts for all anchors", () => {
    for (const fixture of FIXTURES) {
      expect(
        getAnchoredPeriod(
          fixture.anchorDate,
          fixture.interval,
          fixture.referenceDate
        ).periodKey
      ).toBe(fixture.expectedPeriodStart);
    }
  });
});
