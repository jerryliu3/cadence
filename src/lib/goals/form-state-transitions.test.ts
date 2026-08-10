import { describe, expect, it } from "vitest";
import {
  applyFrequencyTypeChange,
  applyMilestoneNameChange,
  applyTargetCountChange,
} from "./form-state-transitions";

describe("goal form state transitions", () => {
  it("defaults fixed-milestone target count to 3 when empty", () => {
    const next = applyFrequencyTypeChange(
      {
        frequency_type: "recurring" as const,
        target_count: "",
        milestone_names: [],
      },
      "fixed_milestones"
    );

    expect(next.target_count).toBe("3");
    expect(next.milestone_names).toEqual(["", "", ""]);
  });

  it("resizes milestone names on target count change for fixed goals", () => {
    const next = applyTargetCountChange(
      {
        frequency_type: "fixed_milestones" as const,
        target_count: "2",
        milestone_names: ["A", "B"],
      },
      "3"
    );

    expect(next.milestone_names).toEqual(["A", "B", ""]);
  });

  it("updates a single milestone name without mutating previous state", () => {
    const previous = {
      frequency_type: "fixed_milestones" as const,
      target_count: "2",
      milestone_names: ["A", "B"],
    };
    const next = applyMilestoneNameChange(previous, 1, "Second");

    expect(next.milestone_names).toEqual(["A", "Second"]);
    expect(previous.milestone_names).toEqual(["A", "B"]);
  });
});
