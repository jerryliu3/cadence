import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";

describe("GoalEndMonthBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses dark text on a light background so the date stays readable", () => {
    render(<GoalEndMonthBadge endDate="2026-08-14" />);

    const badge = screen.getByLabelText("Goal end date Aug 14, 2026");
    expect(badge).toHaveClass("bg-sky-100");
    expect(badge).toHaveClass("text-sky-900");
    expect(badge).not.toHaveClass("text-sky-100");
  });
});
