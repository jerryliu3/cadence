import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayHeaderCard } from "@/features/today/today-header-card";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<Parameters<typeof TodayHeaderCard>[0]> = {}) {
  return {
    viewDateObj: new Date("2026-08-06T12:00:00"),
    viewDate: "2026-08-06",
    todayLocalDate: "2026-08-06",
    viewingToday: true,
    onViewDateChange: vi.fn(),
    onGoToPreviousDate: vi.fn(),
    onGoToNextDate: vi.fn(),
    onResetToToday: vi.fn(),
    categoryFilter: "__all__",
    onCategoryFilterChange: vi.fn(),
    recurrenceFilter: "all" as const,
    onRecurrenceFilterChange: vi.fn(),
    availableCategories: ["health", "personal"],
    allCategoriesFilterValue: "__all__",
    goals: [],
    referenceMonth: "2026-08",
    endMonth: null,
    onEndMonthChange: vi.fn(),
    sort: "earliest_end" as const,
    onSortChange: vi.fn(),
    children: <div>goal list</div>,
    ...overrides,
  };
}

describe("TodayHeaderCard", () => {
  it("renders the formatted date and passed-through children", () => {
    render(<TodayHeaderCard {...baseProps()} />);

    expect(screen.getByText("Thursday, August 6")).toBeInTheDocument();
    expect(screen.getByText("goal list")).toBeInTheDocument();
  });

  it("hides the Today reset button when already viewing today", () => {
    render(<TodayHeaderCard {...baseProps({ viewingToday: true })} />);
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it("shows and wires the Today reset button when not viewing today", async () => {
    const onResetToToday = vi.fn();
    const user = userEvent.setup();
    render(
      <TodayHeaderCard {...baseProps({ viewingToday: false, onResetToToday })} />
    );

    const resetButton = screen.getByRole("button", { name: "Today" });
    await user.click(resetButton);
    expect(onResetToToday).toHaveBeenCalledTimes(1);
  });

  it("calls onGoToPreviousDate and onGoToNextDate from the period stepper", async () => {
    const onGoToPreviousDate = vi.fn();
    const onGoToNextDate = vi.fn();
    const user = userEvent.setup();
    render(
      <TodayHeaderCard
        {...baseProps({ onGoToPreviousDate, onGoToNextDate })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onGoToPreviousDate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(onGoToNextDate).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDateChange with the picked date", async () => {
    const onViewDateChange = vi.fn();
    const user = userEvent.setup();
    render(<TodayHeaderCard {...baseProps({ onViewDateChange })} />);

    const dateInput = screen.getByDisplayValue("2026-08-06");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-09-01");
    expect(onViewDateChange).toHaveBeenCalled();
  });

  it("lists available categories in the category filter and fires onCategoryFilterChange", async () => {
    const onCategoryFilterChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TodayHeaderCard
        {...baseProps({ onCategoryFilterChange })}
      />
    );

    await user.click(screen.getByText("All Categories").closest("button")!);
    await user.click(screen.getByRole("option", { name: "health" }));
    expect(onCategoryFilterChange).toHaveBeenCalledWith("health");
  });

  it("fires onRecurrenceFilterChange when a recurrence option is picked", async () => {
    const onRecurrenceFilterChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TodayHeaderCard {...baseProps({ onRecurrenceFilterChange })} />
    );

    await user.click(screen.getByText("All Recurrences").closest("button")!);
    await user.click(screen.getByRole("option", { name: "Weekly Recurrences" }));
    expect(onRecurrenceFilterChange).toHaveBeenCalledWith("weekly");
  });

  it("links to the bulk and single goal creation routes", () => {
    render(<TodayHeaderCard {...baseProps()} />);

    expect(screen.getByRole("link", { name: /new bulk goal/i })).toHaveAttribute(
      "href",
      "/goals/bulk"
    );
    expect(screen.getByRole("link", { name: /new goal/i })).toHaveAttribute(
      "href",
      "/goals/new"
    );
  });
});
