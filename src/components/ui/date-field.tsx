"use client";

import { format, isValid, parseISO } from "date-fns";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface DateFieldProps
  extends Omit<ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  displayFormat?: string;
}

export function DateField({
  value,
  onValueChange,
  displayFormat = "EEE, MMM d, yyyy",
  className,
  ...props
}: DateFieldProps) {
  const parsed = parseISO(value);
  const displayLabel = isValid(parsed) ? format(parsed, displayFormat) : value;

  return (
    <div className={cn("relative h-8 w-[13.5rem]", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none flex h-8 w-full items-center justify-center rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium"
      >
        {displayLabel}
      </div>
      <input
        {...props}
        type="date"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={displayLabel}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
