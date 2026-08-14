import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayHeaderCard } from "@/features/today/today-header-card";

describe("TodayHeaderCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("puts the weekday in the title and keeps the native date picker on the same row", () => {
    render(
      <TodayHeaderCard
        viewDate="2026-08-14"
        todayLocalDate="2026-08-14"
        viewingToday
        onViewDateChange={vi.fn()}
        onGoToPreviousDate={vi.fn()}
        onGoToNextDate={vi.fn()}
        onResetToToday={vi.fn()}
      >
        <div>Goals</div>
      </TodayHeaderCard>
    );

    const title = screen.getByText("Friday");
    const dateField = screen.getByLabelText("Checklist date");
    expect(title.closest("[data-title-date-row]")).toBe(
      dateField.closest("[data-title-date-row]")
    );
    expect(dateField).toHaveAttribute("type", "date");
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Fri Aug 14, 2026")).not.toBeInTheDocument();
  });
});
