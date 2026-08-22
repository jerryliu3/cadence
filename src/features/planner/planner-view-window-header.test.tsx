import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerViewWindowHeader } from "@/features/planner/planner-view-window-header";

function renderHeader(overrides?: Partial<ComponentProps<typeof PlannerViewWindowHeader>>) {
  const props: ComponentProps<typeof PlannerViewWindowHeader> = {
    loading: false,
    viewMode: "week",
    previousWindowAriaLabel: "Previous week",
    nextWindowAriaLabel: "Next week",
    fixedViewHeadingWidthCh: 12,
    viewHeading: "Week of Aug 24",
    showTodayShortcut: false,
    expandedMonthRows: false,
    onMoveViewWindow: vi.fn(),
    onJumpToToday: vi.fn(),
    onToggleExpandedMonthRows: vi.fn(),
    onOpenMonthView: vi.fn(),
    ...overrides,
  };
  render(<PlannerViewWindowHeader {...props} />);
  return props;
}

describe("PlannerViewWindowHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Month View shortcut when not in month mode", () => {
    const props = renderHeader({ viewMode: "day" });

    const monthViewButton = screen.getByRole("button", { name: "Month View" });
    fireEvent.click(monthViewButton);

    expect(props.onOpenMonthView).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Expand rows")).not.toBeInTheDocument();
  });

  it("keeps row density toggle in month mode", () => {
    renderHeader({ viewMode: "month", expandedMonthRows: false });

    expect(screen.queryByRole("button", { name: "Month View" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand rows" })).toBeInTheDocument();
  });
});
