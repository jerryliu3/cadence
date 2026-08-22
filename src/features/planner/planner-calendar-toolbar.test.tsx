import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("shows Month View beside the Calendar title outside month mode", () => {
    const props = renderToolbar({ viewMode: "day" });

    const title = screen.getByRole("heading", { name: "Calendar" });
    const monthViewButton = screen.getByRole("button", { name: "Month View" });
    expect(title.parentElement).toContainElement(monthViewButton);

    fireEvent.click(monthViewButton);
    expect(props.onViewModeChange).toHaveBeenCalledWith("month");
  });

  it("hides Month View in month mode", () => {
    renderToolbar({ viewMode: "month" });

    expect(screen.queryByRole("button", { name: "Month View" })).not.toBeInTheDocument();
  });
});
