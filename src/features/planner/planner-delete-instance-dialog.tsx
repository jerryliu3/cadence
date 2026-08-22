"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";

interface PlannerDeleteInstanceDialogProps {
  open: boolean;
  entry: PlannerDayDetailEntry | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PlannerDeleteInstanceDialog({
  open,
  entry,
  loading,
  onOpenChange,
  onCancel,
  onConfirm,
}: PlannerDeleteInstanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete planned activity?</DialogTitle>
          <DialogDescription>
            This only removes this planned activity from the goal and decreases its target
            count by one. Other goal settings and sessions remain unchanged.
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <p className="text-sm text-muted-foreground">
            Selected session: <span className="font-medium">{entry.goalTitle ?? entry.label}</span>
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
