"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  STARTER_PACKS,
  type StarterPackKey,
  resolveStarterPackKey,
} from "@/features/goals/starter-packs";
import { TrainingPlanImportEntry } from "@/features/goals/training-plan-import-entry";
import { BulkGoalForm } from "@/features/today/bulk-goal-form";
import { GoalForm } from "@/features/today/goal-form";
import { cn } from "@/lib/utils";

type CreationMode = "single" | "multi" | "training";

interface GoalCreationEntryProps {
  onExit?: () => void;
}

const CREATION_MODE_TABS: Array<{ key: CreationMode; label: string }> = [
  { key: "single", label: "Single" },
  { key: "multi", label: "Multi" },
  { key: "training", label: "Training Plan" },
];

function resolveMode(
  rawMode: string | null,
  allowTrainingPlan: boolean
): CreationMode {
  if (rawMode === "multi") {
    return "multi";
  }
  if (rawMode === "training" && allowTrainingPlan) {
    return "training";
  }
  return "single";
}

export function GoalCreationEntry({ onExit }: GoalCreationEntryProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowTrainingPlan = process.env.NODE_ENV !== "production";

  const mode = useMemo(
    () => resolveMode(searchParams.get("mode"), allowTrainingPlan),
    [allowTrainingPlan, searchParams]
  );

  const modeHref = (nextMode: CreationMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "single") {
      params.delete("mode");
      params.delete("starterPack");
    } else if (nextMode === "training") {
      params.set("mode", "training");
      params.delete("starterPack");
    } else {
      params.set("mode", "multi");
    }
    const query = params.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
  };

  const starterPack = resolveStarterPackKey(searchParams.get("starterPack"));
  const starterPackHref = (pack: StarterPackKey | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "multi");
    if (pack) {
      params.set("starterPack", pack);
    } else {
      params.delete("starterPack");
    }
    const query = params.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4">
        <div className="mx-auto flex w-full max-w-xl items-end border-b border-border/70">
          {CREATION_MODE_TABS.map((tab) => {
            const selected = mode === tab.key;
            const trainingTabLocked = tab.key === "training" && !allowTrainingPlan;
            if (trainingTabLocked) {
              return (
                <span
                  key={tab.key}
                  aria-disabled="true"
                  className="relative flex flex-1 cursor-not-allowed items-center justify-center gap-2 py-2 text-center text-sm font-medium text-muted-foreground/70"
                >
                  <span>{tab.label}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
                    Coming soon
                  </Badge>
                </span>
              );
            }
            return (
              <Link
                key={tab.key}
                href={modeHref(tab.key)}
                replace
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "relative flex-1 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  selected ? "text-foreground" : ""
                )}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-x-1 -bottom-px h-1 rounded-full bg-primary transition-opacity",
                    selected ? "opacity-100" : "opacity-0"
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>
      <div className="w-full">
        {mode === "multi" ? (
          <div className="mb-4 rounded-xl border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Starter packs (optional)</p>
              {starterPack ? (
                <Badge variant="outline" className="capitalize">
                  {STARTER_PACKS.find((pack) => pack.key === starterPack)?.label ?? starterPack} selected
                </Badge>
              ) : (
                <Badge variant="outline">Pick one to prefill drafts</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STARTER_PACKS.map((pack) => (
                <Button key={pack.key} type="button" variant="outline" size="sm" asChild>
                  <Link href={starterPackHref(pack.key)} replace>
                    {pack.label} starter pack
                  </Link>
                </Button>
              ))}
              {starterPack ? (
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link href={starterPackHref(null)} replace>
                    Clear starter pack
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {mode === "single" ? (
          <GoalForm showBackButton={false} onExit={onExit} />
        ) : mode === "multi" ? (
          <BulkGoalForm showBackButton={false} onExit={onExit} />
        ) : (
          <TrainingPlanImportEntry onExit={onExit} />
        )}
      </div>
    </div>
  );
}
