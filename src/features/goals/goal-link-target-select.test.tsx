import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalLinkTargetSelect } from "@/features/goals/goal-link-target-select";
import { buildGoal } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

describe("GoalLinkTargetSelect", () => {
  it("shows the placeholder when closed and no target is linked", () => {
    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("No linked target");
  });

  it("calls onOpenChange when the trigger is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open={false}
        onOpenChange={onOpenChange}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    await user.click(screen.getByRole("combobox"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders filtered goals with recurrence and deadline badges when open", () => {
    const goal = buildGoal({
      id: "goal-2",
      title: "Read daily",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      end_date: "2026-12-31",
    });

    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[goal]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    expect(screen.getByRole("option", { name: /read daily/i })).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Due 2026-12-31")).toBeInTheDocument();
  });

  it("shows a no-linked-target option and calls onValueChange when selected", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalLinkTargetSelect
        value="goal-2"
        onValueChange={onValueChange}
        open
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[buildGoal({ id: "goal-2", title: "Read daily" })]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    await user.click(screen.getByRole("option", { name: "No linked target" }));
    expect(onValueChange).toHaveBeenCalledWith("none");
  });

  it("selecting a goal option calls onValueChange with its id", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-3", title: "Write journal" });

    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={onValueChange}
        open
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[goal]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    await user.click(screen.getByRole("option", { name: /write journal/i }));
    expect(onValueChange).toHaveBeenCalledWith("goal-3");
  });

  it("shows an empty-results message when no goals match the search", () => {
    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open
        onOpenChange={vi.fn()}
        searchQuery="zzz"
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    expect(screen.getByText("No goals match your search.")).toBeInTheDocument();
  });

  it("calls onSearchQueryChange as the search input changes", async () => {
    const onSearchQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={onSearchQueryChange}
        filteredLinkTargets={[]}
        selectedTargetGoal={null}
        sourceEndDate={null}
      />
    );

    await user.type(screen.getByPlaceholderText("Search link targets..."), "run");
    expect(onSearchQueryChange).toHaveBeenCalled();
  });

  it("disambiguates duplicate goal ids across renders with keyPrefix", () => {
    const goal = buildGoal({ id: "goal-4", title: "Meditate" });
    render(
      <GoalLinkTargetSelect
        value=""
        onValueChange={vi.fn()}
        open
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[goal]}
        selectedTargetGoal={null}
        sourceEndDate={null}
        keyPrefix="edit"
      />
    );

    expect(screen.getByRole("option", { name: /meditate/i })).toBeInTheDocument();
  });

  it("shows scheduling warning copy for selected linked target", () => {
    const selectedTarget = buildGoal({ id: "goal-9", title: "Read daily" });
    render(
      <GoalLinkTargetSelect
        value="goal-9"
        onValueChange={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredLinkTargets={[selectedTarget]}
        selectedTargetGoal={selectedTarget}
        sourceEndDate="2026-08-31"
      />
    );

    expect(
      screen.getByText("Linking to Read daily affects calendar visibility.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Linked targets stay hidden through 2026-08-31 and can appear from 2026-09-01."
      )
    ).toBeInTheDocument();
  });
});
