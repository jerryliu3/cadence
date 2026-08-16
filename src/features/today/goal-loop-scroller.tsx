"use client";

import { type ReactNode } from "react";
import type { Goal } from "@/lib/goals/types";

interface GoalLoopScrollerProps {
  goals: Goal[];
  renderGoal: (goal: Goal, repeatIndex: number) => ReactNode;
}

export function GoalLoopScroller({ goals, renderGoal }: GoalLoopScrollerProps) {
  return (
    <div>
      <div
        data-no-swipe="true"
        className="max-h-[390px] overflow-y-auto overscroll-contain px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-y]"
      >
        <div className="space-y-3">
          {goals.map((goal, index) => (
            <div key={`${goal.id}-${index}`}>{renderGoal(goal, index)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
