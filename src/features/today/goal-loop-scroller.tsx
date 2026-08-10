"use client";

import { type ReactNode, type UIEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Goal } from "@/lib/goals/types";

const VISIBLE_GOALS_PER_GROUP = 5;

interface GoalLoopScrollerProps {
  goals: Goal[];
  renderGoal: (goal: Goal, repeatIndex: number) => ReactNode;
}

export function GoalLoopScroller({ goals, renderGoal }: GoalLoopScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldLoop = goals.length > VISIBLE_GOALS_PER_GROUP;
  const repeatedGoals = useMemo(() => {
    if (!shouldLoop) {
      return goals;
    }

    return [...goals, ...goals, ...goals];
  }, [goals, shouldLoop]);
  const [cycleProgress, setCycleProgress] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    if (!shouldLoop) {
      scroller.scrollTop = 0;
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const oneCycleHeight = scroller.scrollHeight / 3;
      if (oneCycleHeight > 0) {
        scroller.scrollTop = oneCycleHeight;
      }
      setCycleProgress(0);
    });

    return () => cancelAnimationFrame(frameId);
  }, [goals, shouldLoop]);

  const onScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      if (!shouldLoop) {
        return;
      }

      const scroller = event.currentTarget;
      const oneCycleHeight = scroller.scrollHeight / 3;
      if (oneCycleHeight <= 0) {
        return;
      }

      let nextScrollTop = scroller.scrollTop;
      if (nextScrollTop <= oneCycleHeight * 0.5) {
        nextScrollTop += oneCycleHeight;
        scroller.scrollTop = nextScrollTop;
      } else if (nextScrollTop >= oneCycleHeight * 2.5) {
        nextScrollTop -= oneCycleHeight;
        scroller.scrollTop = nextScrollTop;
      }

      const normalized =
        ((nextScrollTop - oneCycleHeight) % oneCycleHeight + oneCycleHeight) % oneCycleHeight;
      setCycleProgress(normalized / oneCycleHeight);
    },
    [shouldLoop]
  );

  const thumbHeightPercent = shouldLoop
    ? Math.max((VISIBLE_GOALS_PER_GROUP / goals.length) * 100, 14)
    : 100;
  const thumbTopPercent = shouldLoop ? (100 - thumbHeightPercent) * cycleProgress : 0;
  const loopingSoon = shouldLoop && (cycleProgress <= 0.08 || cycleProgress >= 0.92);

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        data-no-swipe="true"
        className="h-[430px] overflow-y-scroll overscroll-contain pr-4 [scrollbar-width:thin] [touch-action:pan-y]"
        onScroll={onScroll}
      >
        <div className="space-y-3 pr-1">
          {repeatedGoals.map((goal, repeatIndex) => {
            const goalCount = Math.max(goals.length, 1);
            const cycleIndex = Math.floor(repeatIndex / goalCount);
            const inCycleIndex = repeatIndex % goalCount;
            return (
              <div key={`${goal.id}-${cycleIndex}-${inCycleIndex}`}>{renderGoal(goal, repeatIndex)}</div>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-0 top-2 w-2.5">
        <div className="relative h-full rounded-full bg-border/60">
          <div
            className="absolute left-0 right-0 rounded-full bg-primary/70 transition-[top] duration-150"
            style={{ height: `${thumbHeightPercent}%`, top: `${thumbTopPercent}%` }}
          />
        </div>
      </div>

      {shouldLoop ? (
        <div className="pointer-events-none absolute bottom-0 right-4 text-[10px] text-muted-foreground">
          {loopingSoon ? "Looping around" : "Scroll inside list"}
        </div>
      ) : null}
    </div>
  );
}
