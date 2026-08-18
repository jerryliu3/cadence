import { describe, expect, it } from "vitest";
import {
  MAX_GOAL_TARGET_COUNT,
  MAX_HORIZON_MONTHS,
} from "@/lib/planner/contracts/bounds";
import {
  getGoalDeadlineMonthSpan,
  getGoalHorizonEndDate,
  isOrdinalGoalDefinition,
  resolveGoalPlanningEndDate,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";

describe("goal definition validation", () => {
  it("classifies milestone and targeted recurring goals as ordinal", () => {
    expect(
      isOrdinalGoalDefinition({
        frequencyType: "fixed_milestones",
        targetCount: null,
      })
    ).toBe(true);
    expect(
      isOrdinalGoalDefinition({
        frequencyType: "recurring",
        targetCount: 10,
      })
    ).toBe(true);
    expect(
      isOrdinalGoalDefinition({
        frequencyType: "recurring",
        targetCount: null,
      })
    ).toBe(false);
  });

  it("allows open-ended cadence goals", () => {
    expect(
      validateGoalDefinition({
        frequencyType: "recurring",
        targetCount: null,
        startDate: "2026-08-01",
        endDate: null,
      })
    ).toEqual([]);
    expect(
      validateGoalDefinition({
        frequencyType: "recurring",
        targetCount: 0,
        startDate: "2026-08-01",
        endDate: null,
      })
    ).toEqual([]);
  });

  it("allows missing deadlines for ordinal goals via the soft horizon", () => {
    expect(
      validateGoalDefinition({
        frequencyType: "fixed_milestones",
        targetCount: 3,
        startDate: "2026-08-01",
        endDate: null,
      })
    ).toEqual([]);
    expect(
      validateGoalDefinition({
        frequencyType: "recurring",
        targetCount: 12,
        startDate: "2026-08-01",
        endDate: null,
      })
    ).toEqual([]);
  });

  it("enforces the deadline month-span cap", () => {
    expect(
      getGoalDeadlineMonthSpan({
        startDate: "2026-01-01",
        endDate: "2027-12-31",
      })
    ).toBe(MAX_HORIZON_MONTHS);
    expect(
      validateGoalDefinition({
        frequencyType: "recurring",
        targetCount: null,
        startDate: "2026-01-01",
        endDate: "2028-01-01",
      })[0]
    ).toMatchObject({ code: "horizon_too_long" });
    expect(getGoalHorizonEndDate("2026-01-01")).toBe("2027-12-31");
    expect(
      getGoalDeadlineMonthSpan({
        startDate: "2026-01-01",
        endDate: getGoalHorizonEndDate("2026-01-01") ?? "",
      })
    ).toBe(MAX_HORIZON_MONTHS);
  });

  it("uses strict civil-date parsing for month-span checks", () => {
    expect(
      getGoalDeadlineMonthSpan({
        startDate: "2026-02-30",
        endDate: "2026-03-01",
      })
    ).toBeNull();
    expect(
      getGoalDeadlineMonthSpan({
        startDate: "2026-01-01",
        endDate: "2026-13-45",
      })
    ).toBeNull();
  });

  it("computes rolling soft-horizon end dates from max(start, asOf)", () => {
    expect(
      resolveGoalPlanningEndDate({
        frequencyType: "fixed_milestones",
        targetCount: 3,
        startDate: "2026-01-01",
        endDate: null,
        asOfDate: "2026-08-15",
      })
    ).toBe("2028-07-31");
    expect(
      resolveGoalPlanningEndDate({
        frequencyType: "fixed_milestones",
        targetCount: 3,
        startDate: "2026-10-01",
        endDate: null,
        asOfDate: "2026-08-15",
      })
    ).toBe("2028-09-30");
  });

  it("flags likely capacity shortfall when target exceeds available days", () => {
    const issues = validateGoalDefinition({
      frequencyType: "fixed_milestones",
      targetCount: 6,
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      asOfDate: "2026-08-01",
      capacity: {
        restWeekdays: [0, 6],
        blackoutRanges: [],
      },
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "target_exceeds_capacity",
      })
    );
    expect(
      issues.find((issue) => issue.code === "target_exceeds_capacity")?.message
    ).toContain("Only 5 available days");
  });

  it("skips capacity check when no capacity context is provided", () => {
    const issues = validateGoalDefinition({
      frequencyType: "fixed_milestones",
      targetCount: 6,
      startDate: "2026-08-01",
      endDate: "2026-08-07",
    });
    expect(
      issues.some((issue) => issue.code === "target_exceeds_capacity")
    ).toBe(false);
  });

  it("rejects ordinal targets above the supported planner target limit", () => {
    const issues = validateGoalDefinition({
      frequencyType: "fixed_milestones",
      targetCount: MAX_GOAL_TARGET_COUNT + 1,
      startDate: "2026-08-01",
      endDate: "2026-09-30",
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "target_exceeds_limit",
      })
    );
    expect(issues.find((issue) => issue.code === "target_exceeds_limit")?.message).toContain(
      String(MAX_GOAL_TARGET_COUNT)
    );
  });
});
