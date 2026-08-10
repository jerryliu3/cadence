import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCard } from "@/features/today/goal-card";
import { buildGoal, buildProgressSnapshot } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

const referenceDate = new Date("2026-08-06T12:00:00");
const selectedDate = "2026-08-06";
const weeklyAnchor = { weekStartsOn: 0 };

describe("GoalCard", () => {
  it("renders title, category, and an unmarked toggle when not completed today", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-08-06",
      category: "health",
    });

    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Run 5k")).toBeInTheDocument();
    expect(screen.getByText("health")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark goal as complete" })
    ).toBeInTheDocument();
  });

  it("shows the completed toggle state when done for the current period", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-08-06",
    });

    render(
      <GoalCard
        goal={goal}
        completions={[
          { goal_id: goal.id, completed_on: "2026-08-06", source: "manual" },
        ]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Unmark goal completion for current period" })
    ).toBeInTheDocument();
  });

  it("calls onToggle when the completion button is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-08-06",
    });

    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={onToggle}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mark goal as complete" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("disables the toggle button when disabled or archived", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    const { rerender } = render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole("button", { name: "Mark goal as complete" })).toBeDisabled();

    rerender(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
        archived
      />
    );
    expect(screen.getByRole("button", { name: "Mark goal as complete" })).toBeDisabled();
  });

  it("shows the achieved badge when progress outcome is achieved", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        progress={buildProgressSnapshot({ outcome: "achieved", admissibleCompletionCount: 1 })}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Achieved")).toBeInTheDocument();
  });

  it("shows the shortfall badge when progress outcome ended with a shortfall", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        progress={buildProgressSnapshot({
          outcome: "ended_with_shortfall",
          admissibleCompletionCount: 1,
        })}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Shortfall")).toBeInTheDocument();
  });

  it("shows the current milestone name for fixed-milestone goals", () => {
    const goal = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
      start_date: "2026-08-06",
    });

    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText(/current milestone: milestone 1/i)).toBeInTheDocument();
    expect(screen.getByText("0/3 milestones completed")).toBeInTheDocument();
  });

  it("shows the linked-goal count when linkedCount is positive", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={2}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("2 linked")).toBeInTheDocument();
  });

  it("does not show the linked-goal count when linkedCount is zero", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.queryByText(/linked/)).not.toBeInTheDocument();
  });

  it("shows the auto-completed badge when the selected-date completion came from a linked cascade", () => {
    const goal = buildGoal({ start_date: "2026-08-06" });
    render(
      <GoalCard
        goal={goal}
        completions={[
          { goal_id: goal.id, completed_on: selectedDate, source: "linked_cascade" },
        ]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Auto-completed via link")).toBeInTheDocument();
  });

  it("renders the goal description when present", () => {
    const goal = buildGoal({ start_date: "2026-08-06", description: "Every morning" });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Every morning")).toBeInTheDocument();
  });

  it("shows a deadline of None when the goal has no end date", () => {
    const goal = buildGoal({ start_date: "2026-08-06", end_date: null });
    render(
      <GoalCard
        goal={goal}
        completions={[]}
        linkedCount={0}
        selectedDate={selectedDate}
        referenceDate={referenceDate}
        weeklyAnchor={weeklyAnchor}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Deadline: None")).toBeInTheDocument();
  });
});
