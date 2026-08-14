"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateFieldProps
  extends Omit<ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
}

export function DateField({
  value,
  onValueChange,
  className,
  ...props
}: DateFieldProps) {
  return (
    <Input
      {...props}
      type="date"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn("h-8 w-[170px]", className)}
    />
  );
}
