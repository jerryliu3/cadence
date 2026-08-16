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

  it("defaults to Calendar and switches to Checklist in one route", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const user = userEvent.setup();
    render(<PlannerPageShell />);

    expect(screen.getByText("Calendar surface")).toBeInTheDocument();
    expect(screen.queryByText("Checklist surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Checklist" }));

    expect(pushStateSpy.mock.calls.at(-1)?.[2]).toBe(
      "/calendar?surface=checklist"
    );
  });

  it("opens Checklist from the planner surface query", () => {
    mockSearch = "?surface=checklist";

    render(<PlannerPageShell />);

    expect(screen.getByText("Checklist surface")).toBeInTheDocument();
  });
});
