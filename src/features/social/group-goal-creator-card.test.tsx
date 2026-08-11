import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultGroupGoalDraft,
  GroupGoalCreatorCard,
  type GroupGoalDraft,
} from "@/features/social/group-goal-creator-card";

function ControlledCreatorCard() {
  const [draft, setDraft] = useState<GroupGoalDraft>(createDefaultGroupGoalDraft());
  return (
    <GroupGoalCreatorCard
      draft={draft}
      saving={false}
      requiresEndDate={false}
      onDraftChange={(updater) => setDraft(updater)}
      onFrequencyTypeChange={(frequencyType) =>
        setDraft((previous) => ({ ...previous, frequencyType }))
      }
      onCreateGoal={vi.fn()}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("createDefaultGroupGoalDraft", () => {
  it("defaults to a personal, weekly-recurring draft with today's start date", () => {
    const draft = createDefaultGroupGoalDraft();

    expect(draft.categorySelection).toBe("personal");
    expect(draft.frequencyType).toBe("recurring");
    expect(draft.recurrenceInterval).toBe("weekly");
    expect(draft.endDate).toBe("");
    expect(draft.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("GroupGoalCreatorCard", () => {
  it("renders the title field with the draft's current value", () => {
    render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("updates the title as the user types", async () => {
    const user = userEvent.setup();
    render(<ControlledCreatorCard />);

    await user.type(screen.getByLabelText("Title"), "Run");
    expect(screen.getByLabelText("Title")).toHaveValue("Run");
  });

  it("shows the recurrence interval toggle only for recurring goals", () => {
    const { rerender } = render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.getByText("Recurrence interval")).toBeInTheDocument();

    rerender(
      <GroupGoalCreatorCard
        draft={{ ...createDefaultGroupGoalDraft(), frequencyType: "fixed_milestones" }}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.queryByText("Recurrence interval")).not.toBeInTheDocument();
  });

  it("labels the target-count field per frequency type", () => {
    const { rerender } = render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.getByText("Target completions (optional)")).toBeInTheDocument();

    rerender(
      <GroupGoalCreatorCard
        draft={{ ...createDefaultGroupGoalDraft(), frequencyType: "fixed_milestones" }}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.getByText("Target count")).toBeInTheDocument();
  });

  it("calls onFrequencyTypeChange when a goal type is picked", async () => {
    const onFrequencyTypeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={onFrequencyTypeChange}
        onCreateGoal={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Milestone" }));
    expect(onFrequencyTypeChange).toHaveBeenCalledWith("fixed_milestones");
  });

  it("shows a custom-category input only when custom category is selected", () => {
    const { rerender } = render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.queryByPlaceholderText("Custom category label")).not.toBeInTheDocument();

    rerender(
      <GroupGoalCreatorCard
        draft={{ ...createDefaultGroupGoalDraft(), categorySelection: "custom" }}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Custom category label")).toBeInTheDocument();
  });

  it("disables the create button while saving and calls onCreateGoal when clicked", async () => {
    const onCreateGoal = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={onCreateGoal}
      />
    );
    expect(screen.getByRole("button", { name: /create group goal/i })).toBeDisabled();

    rerender(
      <GroupGoalCreatorCard
        draft={createDefaultGroupGoalDraft()}
        saving={false}
        requiresEndDate={false}
        onDraftChange={vi.fn()}
        onFrequencyTypeChange={vi.fn()}
        onCreateGoal={onCreateGoal}
      />
    );
    await user.click(screen.getByRole("button", { name: /create group goal/i }));
    expect(onCreateGoal).toHaveBeenCalledTimes(1);
  });
});
