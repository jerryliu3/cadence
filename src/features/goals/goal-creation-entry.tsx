"use client";

import { ListPlus, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BulkGoalForm } from "@/features/today/bulk-goal-form";
import { GoalForm } from "@/features/today/goal-form";
import { cn } from "@/lib/utils";

type CreationMode = "single" | "multi";

function resolveMode(rawMode: string | null): CreationMode {
  return rawMode === "multi" ? "multi" : "single";
}

export function GoalCreationEntry() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = useMemo(
    () => resolveMode(searchParams.get("mode")),
    [searchParams]
  );

  const setMode = (nextMode: CreationMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "single") {
      params.delete("mode");
    } else {
      params.set("mode", "multi");
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Create goals</CardTitle>
          <CardDescription>
            Start with one goal or switch to multi-goal creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "single" ? "secondary" : "ghost"}
              className="h-8 rounded-md px-3"
              onClick={() => setMode("single")}
            >
              <Plus className="size-4" />
              Single goal
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "multi" ? "secondary" : "ghost"}
              className="h-8 rounded-md px-3"
              onClick={() => setMode("multi")}
            >
              <ListPlus className="size-4" />
              Multiple goals
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className={cn(mode === "single" && "mx-auto w-full max-w-3xl")}>
        {mode === "single" ? <GoalForm showBackButton={false} /> : <BulkGoalForm showBackButton={false} />}
      </div>
    </div>
  );
}
