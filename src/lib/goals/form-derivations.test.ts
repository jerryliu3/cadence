import { describe, expect, it } from "vitest";
import {
  canShowRecurrenceFields,
  canShowTargetCount,
  deriveDefinitionTargetCount,
  getFixedMilestoneCount,
  requiresGoalEndDate,
} from "./form-derivations";

describe("form derivation helpers", () => {
  it("returns visibility flags for recurrence and target count controls", () => {
    expect(canShowRecurrenceFields("recurring")).toBe(true);
    expect(canShowRecurrenceFields("fixed_milestones")).toBe(false);
    expect(canShowTargetCount("recurring")).toBe(true);
    expect(canShowTargetCount("fixed_milestones")).toBe(true);
  });

  it("derives definition target count from raw and parsed values", () => {
    expect(
      deriveDefinitionTargetCount({
        frequencyType: "fixed_milestones",
        targetCountRaw: "3",
        parsedTargetCount: 3,
      })
    ).toBe(3);
    expect(
      deriveDefinitionTargetCount({
        frequencyType: "recurring",
        targetCountRaw: "",
        parsedTargetCount: null,
      })
    ).toBeNull();
    expect(
      deriveDefinitionTargetCount({
        frequencyType: "recurring",
        targetCountRaw: "2",
        parsedTargetCount: 2,
      })
    ).toBe(2);
  });

  it("computes fixed milestone count only for milestone goals", () => {
    expect(getFixedMilestoneCount("fixed_milestones", 4)).toBe(4);
    expect(getFixedMilestoneCount("fixed_milestones", null)).toBe(0);
    expect(getFixedMilestoneCount("recurring", 4)).toBe(0);
  });

  it("derives end-date requirement using ordinal goal rules", () => {
    expect(requiresGoalEndDate("fixed_milestones", 3)).toBe(true);
    expect(requiresGoalEndDate("recurring", null)).toBe(false);
  });
});
