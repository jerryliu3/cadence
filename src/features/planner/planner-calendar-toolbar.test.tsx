import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerCalendarToolbar } from "@/features/planner/planner-calendar-toolbar";

function renderToolbar(
  overrides?: Partial<ComponentProps<typeof PlannerCalendarToolbar>>
) {
  const props: ComponentProps<typeof PlannerCalendarToolbar> = {
    hasDraftSession: false,
    plannerReadOnly: false,
    canShowSaveAction: false,
    saveButtonLabel: "Save plan",
    draftSaveBlockedMessage: null,
    saveDisabled: false,
    undoDisabled: false,
    loading: false,
    viewMode: "week",
    canOpenSettings: true,
    linkedTargetDetails: [],
    searchQuery: "",
    onSave: vi.fn(),
    onDiscardDraftChanges: vi.fn(),
    onViewModeChange: vi.fn(),
    onOpenFilters: vi.fn(),
    onOpenSettings: vi.fn(),
    onSearchQueryChange: vi.fn(),
    ...overrides,
  };
  render(<PlannerCalendarToolbar {...props} />);
  return props;
}

describe("PlannerCalendarToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("places calendar help beside the Calendar title", () => {
    renderToolbar();

    const title = screen.getByRole("heading", { name: "Calendar" });
    const helpButton = screen.getByRole("button", { name: "Open calendar help" });
    expect(title.parentElement).toContainElement(helpButton);
  });

  it("shows hidden linked goals from the calendar help dialog", async () => {
    renderToolbar({
      linkedTargetDetails: [
        {
          goalId: "goal-b",
          goalTitle: "Goal B",
          statusCopy: "hidden while linked subgoals are still active",
          sourceGoalTitles: ["Goal A"],
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Open calendar help" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "See hidden goals" }));

    expect(
      within(dialog).getByText(
        /Goal B: hidden while linked subgoals are still active Linked source goals: Goal A\./i
      )
    ).toBeInTheDocument();
  });
});
