"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultMilestoneName } from "@/lib/goals/milestones";

interface MilestoneNameFieldsProps {
  count: number;
  values: string[];
  onValueChange: (index: number, value: string) => void;
  showLabel?: boolean;
  label?: string;
  keyPrefix?: string;
}

export function MilestoneNameFields({
  count,
  values,
  onValueChange,
  showLabel = true,
  label = "Milestone names (optional)",
  keyPrefix = "milestone-name",
}: MilestoneNameFieldsProps) {
  return (
    <div className="space-y-2">
      {showLabel ? <Label>{label}</Label> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: count }).map((_, index) => (
          <Input
            key={`${keyPrefix}-${index + 1}`}
            value={values[index] ?? ""}
            onChange={(event) => onValueChange(index, event.target.value)}
            placeholder={defaultMilestoneName(index)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Leave any field blank to use the default name.</p>
    </div>
  );
}
