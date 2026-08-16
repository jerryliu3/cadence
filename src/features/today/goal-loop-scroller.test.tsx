import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalLoopScroller } from "./goal-loop-scroller";
import type { Goal } from "@/lib/goals/types";

describe("GoalLoopScroller", () => {
  it("uses equal horizontal padding around clipped goal cards", () => {
    const { container } = render(
      <GoalLoopScroller
        goals={[{ id: "goal-1" } as Goal]}
        renderGoal={(goal) => <div>{goal.id}</div>}
      />
    );

    const scroller = container.querySelector('[data-no-swipe="true"]');
    expect(scroller).toHaveClass("px-1");
    expect(scroller).not.toHaveClass("pr-1");
    expect(scroller?.firstElementChild).not.toHaveClass("pr-1");
  });
});
