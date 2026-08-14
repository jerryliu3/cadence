import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayHeaderCard } from "@/features/today/today-header-card";

describe("TodayHeaderCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the date picker on the same row as Today and centered", () => {
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

    const title = screen.getByText("Today");
    const dateField = screen.getByLabelText("Checklist date");
    expect(title.closest("[data-title-date-row]")).toBe(
      dateField.closest("[data-title-date-row]")
    );
    expect(dateField).toHaveAttribute("type", "date");
    expect(screen.getByText("Fri Aug 14, 2026")).toBeInTheDocument();
    expect(screen.getByText("Fri Aug 14, 2026").closest("[data-title-date-row]")).toBeNull();
  });
});
