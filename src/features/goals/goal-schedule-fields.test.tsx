import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalDateRangeFields } from "@/features/goals/goal-schedule-fields";

describe("GoalDateRangeFields", () => {
  afterEach(() => {
    cleanup();
  });

  it("matches the compact height of the other goal-form dropdowns", () => {
    render(
      <GoalDateRangeFields
        startDate="2026-08-14"
        endDate="2026-12-31"
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        requiresEndDate
        startDateId="start-date"
        endDateId="end-date"
      />
    );

    expect(screen.getByLabelText("Start date")).toHaveClass("h-8");
    expect(screen.getByLabelText("End date")).toHaveClass("h-8");
    expect(screen.getByLabelText("Start date")).not.toHaveClass("h-9");
  });
});
