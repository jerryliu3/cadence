import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalLoopScroller } from "@/features/today/goal-loop-scroller";
import { buildGoal } from "@/lib/goals/goal-test-fixtures";

afterEach(() => {
  cleanup();
});

describe("GoalLoopScroller", () => {
  it("renders each goal exactly once when the list fits without looping", () => {
    const goals = [
      buildGoal({ id: "g1", title: "Run" }),
      buildGoal({ id: "g2", title: "Read" }),
      buildGoal({ id: "g3", title: "Meditate" }),
    ];

    render(
      <GoalLoopScroller
        goals={goals}
        renderGoal={(goal) => <div key={goal.id}>{goal.title}</div>}
      />
    );

    expect(screen.getAllByText("Run")).toHaveLength(1);
    expect(screen.getAllByText("Read")).toHaveLength(1);
    expect(screen.getAllByText("Meditate")).toHaveLength(1);
    expect(screen.queryByText("Scroll inside list")).not.toBeInTheDocument();
    expect(screen.queryByText("Looping around")).not.toBeInTheDocument();
  });

  it("repeats the goal list three times and shows the looping hint when the list exceeds the visible group size", () => {
    const goals = Array.from({ length: 6 }, (_, index) =>
      buildGoal({ id: `g${index}`, title: `Goal ${index}` })
    );

    render(
      <GoalLoopScroller
        goals={goals}
        renderGoal={(goal) => <div key={goal.id}>{goal.title}</div>}
      />
    );

    expect(screen.getAllByText("Goal 0")).toHaveLength(3);
    expect(screen.getByText(/looping around|scroll inside list/i)).toBeInTheDocument();
  });

  it("passes the repeat index to renderGoal for each repetition", () => {
    const goals = Array.from({ length: 6 }, (_, index) =>
      buildGoal({ id: `g${index}`, title: `Goal ${index}` })
    );
    const seenIndexes: number[] = [];

    render(
      <GoalLoopScroller
        goals={goals}
        renderGoal={(goal, repeatIndex) => {
          seenIndexes.push(repeatIndex);
          return <div key={`${goal.id}-${repeatIndex}`}>{goal.title}</div>;
        }}
      />
    );

    expect(seenIndexes).toEqual(Array.from({ length: 18 }, (_, index) => index));
  });

  it("renders nothing extra when the goal list is empty", () => {
    render(<GoalLoopScroller goals={[]} renderGoal={() => <div>unused</div>} />);

    expect(screen.queryByText("unused")).not.toBeInTheDocument();
    expect(screen.queryByText("Scroll inside list")).not.toBeInTheDocument();
  });
});
