import { describe, expect, it } from "vitest";
import {
  isHistoricalPlannerEntryClassification,
  shouldBlockAutomatedReplanMoveForEntry,
} from "@/features/planner/replan-move-guard";

describe("replan move guard", () => {
  it("blocks automated replan moves for historical classifications", () => {
    expect(
      shouldBlockAutomatedReplanMoveForEntry({
        baselineClassification: "historical_shortfall",
        baselineScheduledDate: "2026-08-10",
        asOfDate: "2026-08-20",
      })
    ).toBe(true);
  });

  it("blocks automated replan moves for baseline dates before as-of", () => {
    expect(
      shouldBlockAutomatedReplanMoveForEntry({
        baselineClassification: "planned",
        baselineScheduledDate: "2026-08-10",
        asOfDate: "2026-08-20",
      })
    ).toBe(true);
  });

  it("allows automated replan moves for non-historical current/future entries", () => {
    expect(
      shouldBlockAutomatedReplanMoveForEntry({
        baselineClassification: "planned",
        baselineScheduledDate: "2026-08-20",
        asOfDate: "2026-08-20",
      })
    ).toBe(false);
  });

  it("identifies historical classifications", () => {
    expect(isHistoricalPlannerEntryClassification("historical_miss")).toBe(true);
    expect(isHistoricalPlannerEntryClassification("planned")).toBe(false);
  });
});

