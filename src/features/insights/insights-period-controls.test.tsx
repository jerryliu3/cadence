import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightsPeriodStepper } from "./insights-period-controls";

const originalShowPicker = HTMLInputElement.prototype.showPicker;

describe("InsightsPeriodStepper", () => {
  afterEach(() => {
    HTMLInputElement.prototype.showPicker = originalShowPicker;
  });

  it("opens the native month picker when the displayed month is clicked", () => {
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;

    render(
      <InsightsPeriodStepper
        monthCursor={new Date(2026, 7, 1)}
        onMonthCursorChange={vi.fn()}
        perGoalViewMode="month"
      />
    );

    fireEvent.click(screen.getByLabelText("Choose month and year"));

    expect(showPicker).toHaveBeenCalledOnce();
  });
});
