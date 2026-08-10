import { describe, expect, it } from "vitest";
import {
  getFirstGoalFormValidationError,
  validateGoalFormInput,
} from "./form-validation";

const baseInput = {
  title: "Read books",
  category_selection: "personal" as const,
  custom_category: "",
  color: "#123456",
  frequency_type: "recurring" as const,
  recurrence_interval: "weekly" as const,
  target_count: "",
  milestone_names: [],
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  default_local_time: "",
  is_group: false,
  linked_target_goal_id: "none",
};

describe("validateGoalFormInput", () => {
  it("returns no errors for a valid recurring goal", () => {
    expect(
      validateGoalFormInput(baseInput, {
        requireRecurrenceInterval: true,
      })
    ).toEqual([]);
  });

  it("validates required title and custom category", () => {
    expect(
      validateGoalFormInput({
        ...baseInput,
        title: " ",
      })
    ).toContain("Title is required.");
    expect(
      validateGoalFormInput({
        ...baseInput,
        category_selection: "custom",
        custom_category: "",
      })
    ).toContain("Custom category name is required.");
  });

  it("enforces fixed milestone target count and optional milestone alignment", () => {
    expect(
      validateGoalFormInput({
        ...baseInput,
        frequency_type: "fixed_milestones",
        target_count: "0",
      })
    ).toContain("Milestone goals require a positive target count.");

    expect(
      validateGoalFormInput(
        {
          ...baseInput,
          frequency_type: "fixed_milestones",
          target_count: "3",
          milestone_names: ["Only one"],
        },
        { validateMilestoneNameAlignment: true }
      )
    ).toContain("Milestone names must align with target count.");
  });

  it("validates optional local time and color format flags", () => {
    expect(
      validateGoalFormInput({
        ...baseInput,
        default_local_time: "8:30",
      })
    ).toContain("Default time must be a valid 24-hour HH:MM value.");

    expect(
      validateGoalFormInput(
        {
          ...baseInput,
          color: "blue",
        },
        { validateHexColor: true }
      )
    ).toContain("Color accent must be a valid hex color.");
  });

  it("enforces recurrence selection and group-link exclusion when requested", () => {
    expect(
      validateGoalFormInput(
        {
          ...baseInput,
          recurrence_interval: "" as unknown as (typeof baseInput)["recurrence_interval"],
        },
        { requireRecurrenceInterval: true }
      )
    ).toContain("Repeat goals require a recurrence interval.");

    expect(
      validateGoalFormInput(
        {
          ...baseInput,
          is_group: true,
          linked_target_goal_id: "goal-2",
        },
        { validateGroupLinkExclusion: true }
      )
    ).toContain("Group goals cannot be linked to another goal.");
  });
});

describe("getFirstGoalFormValidationError", () => {
  it("returns the first validation message or null", () => {
    expect(
      getFirstGoalFormValidationError({
        ...baseInput,
        title: "",
      })
    ).toBe("Title is required.");
    expect(getFirstGoalFormValidationError(baseInput)).toBeNull();
  });
});
