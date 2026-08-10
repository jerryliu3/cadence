import { describe, expect, it } from "vitest";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
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
      "Due 2026-09-01"
    );
    expect(getLinkedGoalDeadlineLabel({ end_date: null })).toBe("No deadline");
  });
});
