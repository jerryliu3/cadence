"use client";

import { CalendarPlus, ListPlus, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { TrainingPlanImportEntry } from "@/features/goals/training-plan-import-entry";
import { BulkGoalForm } from "@/features/today/bulk-goal-form";
import { GoalForm } from "@/features/today/goal-form";

type CreationMode = "single" | "multi" | "training";

interface GoalCreationEntryProps {
  onExit?: () => void;
}

function resolveMode(rawMode: string | null): CreationMode {
  if (rawMode === "multi") {
    return "multi";
  }
  if (rawMode === "training") {
    return "training";
  }
  return "single";
}

export function GoalCreationEntry({ onExit }: GoalCreationEntryProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mode = useMemo(
    () => resolveMode(searchParams.get("mode")),
    [searchParams]
  );

  const modeHref = (nextMode: CreationMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "single") {
      params.delete("mode");
    } else if (nextMode === "training") {
      params.set("mode", "training");
    } else {
      params.set("mode", "multi");
    }
    const query = params.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
  };

  const singleGoalHref = modeHref("single");
  const multiGoalHref = modeHref("multi");
  const trainingImportHref = modeHref("training");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="w-full">
        {mode === "single" ? (
          <GoalForm
            showBackButton={false}
            onExit={onExit}
            modeSwitchControl={
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={multiGoalHref} replace>
                    <ListPlus className="size-4" />
                    Multiple goals
                  </Link>
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={trainingImportHref} replace>
                    <CalendarPlus className="size-4" />
                    Training plan
                  </Link>
                </Button>
              </div>
            }
          />
        ) : mode === "multi" ? (
          <BulkGoalForm
            showBackButton={false}
            onExit={onExit}
            modeSwitchControl={
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={singleGoalHref} replace>
                    <Plus className="size-4" />
                    New goal
                  </Link>
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link href={trainingImportHref} replace>
                    <CalendarPlus className="size-4" />
                    Training plan
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={singleGoalHref} replace>
                  <Plus className="size-4" />
                  New goal
                </Link>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={multiGoalHref} replace>
                  <ListPlus className="size-4" />
                  Multiple goals
                </Link>
              </Button>
            </div>
            <TrainingPlanImportEntry onExit={onExit} />
          </div>
        )}
      </div>
    </div>
  );
}
