import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InsightsGoalStatsFilters } from "./insights-goal-stats-filters";

describe("InsightsGoalStatsFilters", () => {
  it("keeps quick period controls visible and moves full controls into a sheet", () => {
    const onEndMonthChange = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <InsightsGoalStatsFilters
        goals={[]}
        referenceMonth="2026-08"
        endMonth={null}
        onEndMonthChange={onEndMonthChange}
        sort="earliest_end"
        onSortChange={vi.fn()}
        monthCursor={new Date(2026, 7, 1)}
        onMonthCursorChange={vi.fn()}
        viewMode="month"
        onViewModeChange={onViewModeChange}
        showPastGoals={false}
        pastGoalCount={3}
        onShowPastGoalsChange={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(
      screen.getByTestId("insights-quick-filters")
    ).toHaveClass("flex", "overflow-x-auto");
    expect(
      screen.getByText("Next month").closest("button")
    ).toHaveClass("h-8", "shrink-0", "rounded-full");
    expect(screen.queryByText("Filters")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Next month"));
    expect(onEndMonthChange).toHaveBeenCalledWith("2026-09");

    fireEvent.click(screen.getByText("Year view"));
    expect(onViewModeChange).toHaveBeenCalledWith("year");

    expect(
      screen.getByRole("heading", { name: "Insights filters" })
    ).toBeInTheDocument();
    expect(screen.getByText("Show past goals")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });
});
