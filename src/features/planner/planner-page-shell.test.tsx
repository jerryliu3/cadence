import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerPageShell } from "./planner-page-shell";

let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/features/planner/calendar-page-shell", () => ({
  CalendarPageShell: () => <div>Calendar surface</div>,
}));

vi.mock("@/features/today/checklist-shell", () => ({
  ChecklistShell: () => <div>Checklist surface</div>,
}));

describe("PlannerPageShell", () => {
  afterEach(() => {
    cleanup();
    mockSearch = "";
  });

  it("defaults to Checklist and switches to Calendar in one route", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const user = userEvent.setup();
    render(<PlannerPageShell />);

    expect(screen.getByText("Checklist surface")).toBeInTheDocument();
    expect(screen.queryByText("Calendar surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Calendar" }));

    expect(pushStateSpy.mock.calls.at(-1)?.[2]).toBe(
      "/calendar?surface=calendar"
    );
  });

  it("opens Calendar from the planner surface query", () => {
    mockSearch = "?surface=calendar";

    render(<PlannerPageShell />);

    expect(screen.getByText("Calendar surface")).toBeInTheDocument();
  });
});
