"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PeriodStepperProps {
  center: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  className?: string;
}

export function PeriodStepper({
  center,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  previousAriaLabel = "Previous period",
  nextAriaLabel = "Next period",
  className,
}: PeriodStepperProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onPrevious?.()}
        disabled={!onPrevious || previousDisabled}
        aria-label={previousAriaLabel}
      >
        <ChevronLeft className="size-4" />
      </Button>
      {center}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onNext?.()}
        disabled={!onNext || nextDisabled}
        aria-label={nextAriaLabel}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
