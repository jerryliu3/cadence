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
  size = "md",
  className,
  onClick,
  ...props
}: CompletionToggleProps) {
  const OPTIMISTIC_FALLBACK_MS = 8_000;
  const classes = sizeClasses[size];
  const [pressActive, setPressActive] = React.useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = React.useState<boolean | null>(
    null
  );
  const optimisticBaseStateRef = React.useRef<boolean | null>(null);
  const pressTimerRef = React.useRef<number | null>(null);
  const optimisticTimerRef = React.useRef<number | null>(null);

  const clearOptimisticState = React.useCallback(() => {
    setOptimisticCompleted(null);
    optimisticBaseStateRef.current = null;
    if (optimisticTimerRef.current !== null) {
      window.clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
      if (optimisticTimerRef.current !== null) {
        window.clearTimeout(optimisticTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    if (
      optimisticCompleted !== null &&
      optimisticBaseStateRef.current !== null &&
      completed !== optimisticBaseStateRef.current
    ) {
      clearOptimisticState();
    }
  }, [clearOptimisticState, completed, optimisticCompleted]);

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

    optimisticBaseStateRef.current = completed;
    setOptimisticCompleted(desiredState);
    if (optimisticTimerRef.current !== null) {
      window.clearTimeout(optimisticTimerRef.current);
    }
    optimisticTimerRef.current = window.setTimeout(() => {
      setOptimisticCompleted(null);
      optimisticBaseStateRef.current = null;
      optimisticTimerRef.current = null;
    }, OPTIMISTIC_FALLBACK_MS);
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
