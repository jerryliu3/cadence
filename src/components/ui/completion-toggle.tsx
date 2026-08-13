"use client";

import { CheckCircle2, Circle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { triggerLightPressFeedback } from "@/lib/feedback/haptics";

const sizeClasses = {
  sm: {
    button: "size-6",
    icon: "size-3.5",
  },
  md: {
    button: "size-8",
    icon: "size-4",
  },
  lg: {
    button: "size-10",
    icon: "size-5",
  },
} as const;

interface CompletionToggleProps
  extends Omit<React.ComponentProps<"button">, "children"> {
  completed: boolean;
  pending?: boolean;
  size?: keyof typeof sizeClasses;
}

export function CompletionToggle({
  completed,
  pending = false,
  size = "md",
  className,
  onClick,
  ...props
}: CompletionToggleProps) {
  const classes = sizeClasses[size];
  const [pressActive, setPressActive] = React.useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = React.useState<boolean | null>(
    null
  );
  const pressTimerRef = React.useRef<number | null>(null);
  const sawPendingRef = React.useRef(false);

  React.useEffect(
    () => () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    if (pending) {
      sawPendingRef.current = true;
    }
  }, [pending]);

  React.useEffect(() => {
    if (optimisticCompleted === null) {
      return;
    }
    if (completed === optimisticCompleted) {
      setOptimisticCompleted(null);
      sawPendingRef.current = false;
      return;
    }
    if (sawPendingRef.current && !pending) {
      setOptimisticCompleted(null);
      sawPendingRef.current = false;
    }
  }, [completed, optimisticCompleted, pending]);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    triggerLightPressFeedback();
    const desiredState = !completed;

    if (desiredState) {
      setPressActive(true);
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
      pressTimerRef.current = window.setTimeout(() => {
        setPressActive(false);
        pressTimerRef.current = null;
      }, 360);
    } else if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      setPressActive(false);
    }

    setOptimisticCompleted(desiredState);
    onClick?.(event);
  };

  const visualCompleted = optimisticCompleted ?? completed;

  return (
    <button
      type="button"
      data-completed={completed}
      data-visual-completed={visualCompleted}
      data-motion="completion-toggle"
      className={cn(
        "group relative isolate flex shrink-0 touch-manipulation items-center justify-center overflow-visible rounded-full border border-border bg-background shadow-sm transition-[transform,box-shadow,background-color,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0.5 active:scale-[0.94] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none",
        classes.button,
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {visualCompleted || pressActive ? (
        <>
          {pressActive ? (
            <span
              aria-hidden="true"
              className="motion-completion-ring pointer-events-none absolute inset-0 -z-10 rounded-full border border-primary/50"
            />
          ) : null}
          {visualCompleted ? (
            <CheckCircle2
              key="completed"
              className={cn(
                pressActive && "motion-completion-icon",
                "text-primary",
                classes.icon
              )}
            />
          ) : (
            <CheckCircle2
              key="pending"
              className={cn(
                "motion-completion-icon text-primary",
                classes.icon
              )}
            />
          )}
        </>
      ) : (
        <Circle
          key="incomplete"
          className={cn("text-muted-foreground", classes.icon)}
        />
      )}
    </button>
  );
}
