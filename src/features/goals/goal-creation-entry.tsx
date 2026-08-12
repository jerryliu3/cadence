"use client";

import { ListPlus, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { BulkGoalForm } from "@/features/today/bulk-goal-form";
import { GoalForm } from "@/features/today/goal-form";

type CreationMode = "single" | "multi";

function resolveMode(rawMode: string | null): CreationMode {
  return rawMode === "multi" ? "multi" : "single";
}

export function GoalCreationEntry() {
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
    } else {
      params.set("mode", "multi");
    }
    const query = params.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
  };

  const singleGoalHref = modeHref("single");
  const multiGoalHref = modeHref("multi");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="w-full">
        {mode === "single" ? (
          <GoalForm
            showBackButton={false}
            modeSwitchControl={
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={multiGoalHref}>
                  <ListPlus className="size-4" />
                  Multiple goals
                </Link>
              </Button>
            }
          />
        ) : (
          <BulkGoalForm
            showBackButton={false}
            modeSwitchControl={
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={singleGoalHref}>
                  <Plus className="size-4" />
                  New goal
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
