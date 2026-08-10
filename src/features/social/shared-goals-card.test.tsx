import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedGoalsCard } from "@/features/social/shared-goals-card";
import { buildCompletion, buildGoal, buildProfile } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

const monthCursor = new Date("2026-08-01T00:00:00");

describe("SharedGoalsCard", () => {
  it("shows an empty state when no goals are shared", () => {
    render(
      <SharedGoalsCard
        sharedGoals={[]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );

    expect(screen.getByText("No goals have been shared with you yet.")).toBeInTheDocument();
  });

  it("renders a shared goal with its owner and completion percentage", () => {
    const goal = buildGoal({
      id: "goal-1",
      title: "Run 5k",
      owner_id: "user-2",
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-08-01",
    });
    const completions = [
      buildCompletion({ goal_id: "goal-1", user_id: "user-2", completed_on: "2026-08-01" }),
    ];

    render(
      <SharedGoalsCard
        sharedGoals={[goal]}
        sharedOwners={{ "goal-1": buildProfile({ id: "user-2", username: "alex" }) }}
        completionsByGoal={new Map([["goal-1", completions]])}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );

    expect(screen.getByText("Run 5k")).toBeInTheDocument();
    expect(screen.getByText("shared by @alex")).toBeInTheDocument();
  });

  it("falls back to unknown owner copy when the owner profile is missing", () => {
    const goal = buildGoal({ id: "goal-1" });

    render(
      <SharedGoalsCard
        sharedGoals={[goal]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );

    expect(screen.getByText("shared by @unknown")).toBeInTheDocument();
    expect(screen.getByText("No display name")).toBeInTheDocument();
  });

  it("renders milestone pills only for fixed-milestone goals", () => {
    const milestoneGoal = buildGoal({
      id: "goal-1",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
    });

    const { rerender } = render(
      <SharedGoalsCard
        sharedGoals={[milestoneGoal]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );
    expect(screen.getByText("Milestone 1")).toBeInTheDocument();

    const recurringGoal = buildGoal({
      id: "goal-2",
      frequency_type: "recurring",
      recurrence_interval: "daily",
    });
    rerender(
      <SharedGoalsCard
        sharedGoals={[recurringGoal]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );
    expect(screen.queryByText("Milestone 1")).not.toBeInTheDocument();
  });

  it("calls onRemoveSharedGoal with the goal id", async () => {
    const onRemoveSharedGoal = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({ id: "goal-1" });

    render(
      <SharedGoalsCard
        sharedGoals={[goal]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={onRemoveSharedGoal}
      />
    );

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemoveSharedGoal).toHaveBeenCalledWith("goal-1");
  });

  it("steps the month cursor backward and forward", async () => {
    const onSharedMonthCursorChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SharedGoalsCard
        sharedGoals={[]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={onSharedMonthCursorChange}
        onRemoveSharedGoal={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onSharedMonthCursorChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(onSharedMonthCursorChange).toHaveBeenCalledTimes(2);
  });

  it("renders the current shared month label", () => {
    render(
      <SharedGoalsCard
        sharedGoals={[]}
        sharedOwners={{}}
        completionsByGoal={new Map()}
        sharedMonthCursor={monthCursor}
        onSharedMonthCursorChange={vi.fn()}
        onRemoveSharedGoal={vi.fn()}
      />
    );

    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });
});
