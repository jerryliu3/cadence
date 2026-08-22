import { describe, expect, it } from "vitest";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
  getLinkedTargetSchedulingNotice,
} from "./linked-goal-labels";

describe("linked goal label helpers", () => {
  it("renders recurrence label for fixed milestones", () => {
    expect(
      getLinkedGoalRecurrenceLabel({
        frequency_type: "fixed_milestones",
        recurrence_interval: "daily",
      })
    ).toBe("Milestone");
  });

  it("renders recurrence label for recurring goals", () => {
    expect(
      getLinkedGoalRecurrenceLabel({
        frequency_type: "recurring",
        recurrence_interval: "weekly",
      })
    ).toBe("Weekly");
    expect(
      getLinkedGoalRecurrenceLabel({
        frequency_type: "recurring",
        recurrence_interval: "monthly",
      })
    ).toBe("Monthly");
    expect(
      getLinkedGoalRecurrenceLabel({
        frequency_type: "recurring",
        recurrence_interval: "daily",
      })
    ).toBe("Daily");
  });

  it("renders deadline labels", () => {
    expect(getLinkedGoalDeadlineLabel({ end_date: "2026-09-01" })).toBe(
      "Due Sep 1, 2026"
    );
    expect(getLinkedGoalDeadlineLabel({ end_date: null })).toBe("No deadline");
  });

  it("renders linked-goal scheduling notices", () => {
    expect(getLinkedTargetSchedulingNotice({ sourceEndDate: null })).toBe(
      "Linked main goals stay hidden while this subgoal is still active (it has no end date)."
    );
    expect(getLinkedTargetSchedulingNotice({ sourceEndDate: "2026-09-01" })).toBe(
      "Linked main goals stay hidden through Sep 1, 2026 and can show from Sep 2, 2026."
    );
  });
});
