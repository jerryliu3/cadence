import { describe, expect, it } from "vitest";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";
import {
  getGoalDeadlineMonthSpan,
  goalRequiresDeadline,
  isOrdinalGoalDefinition,
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

  it("requires deadlines only for ordinal definitions", () => {
    expect(
      goalRequiresDeadline({
        frequencyType: "fixed_milestones",
        targetCount: 3,
      })
    ).toBe(true);
    expect(
      goalRequiresDeadline({
        frequencyType: "recurring",
        targetCount: 3,
      })
    ).toBe(true);
    expect(
      goalRequiresDeadline({
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
  });

  it("rejects missing deadlines for milestones and targeted recurring goals", () => {
    expect(
      validateGoalDefinition({
        frequencyType: "fixed_milestones",
        targetCount: 3,
        startDate: "2026-08-01",
        endDate: null,
      })[0]
    ).toMatchObject({ code: "missing_end_date" });
    expect(
      validateGoalDefinition({
        frequencyType: "recurring",
        targetCount: 12,
        startDate: "2026-08-01",
        endDate: null,
      })[0]
    ).toMatchObject({ code: "missing_end_date" });
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
  });
});
