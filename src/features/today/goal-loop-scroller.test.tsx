import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import { GoalLoopScroller } from "@/features/today/goal-loop-scroller";

function buildGoal(index: number): Goal {
  return {
    id: `goal-${index}`,
    owner_id: "11111111-1111-4111-8111-111111111111",
    title: `Goal ${index}`,
    description: null,
    category: "Health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("GoalLoopScroller", () => {
  it("renders the large scrolling container for dense groups", () => {
    const goals = Array.from({ length: 6 }, (_, index) => buildGoal(index));

    render(
      <GoalLoopScroller
        goals={goals}
        renderGoal={(goal) => <div key={goal.id}>{goal.title}</div>}
      />
    );

    const scroller = screen.getByTestId("goal-loop-scroller");
    expect(scroller).toHaveClass("h-[min(65vh,560px)]");
    expect(screen.getByText("Swipe vertically to browse")).toBeInTheDocument();
  });
});
