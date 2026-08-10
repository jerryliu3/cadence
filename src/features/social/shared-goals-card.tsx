"use client";

import { addMonths, format, subMonths } from "date-fns";
import { UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { StateCard } from "@/components/ui/state-card";
import { MilestonePills } from "@/features/goals/milestone-pills";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { buildMilestoneNames } from "@/lib/goals/milestones";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import type { Completion, Goal, Profile } from "@/lib/goals/types";

function getSortedCompletionDates(completions: Completion[]): string[] {
  return Array.from(new Set(completions.map((completion) => completion.completed_on))).sort((a, b) =>
    a.localeCompare(b)
  );
}

interface SharedGoalsCardProps {
  sharedGoals: Goal[];
  sharedOwners: Record<string, Profile>;
  completionsByGoal: Map<string, Completion[]>;
  sharedMonthCursor: Date;
  onSharedMonthCursorChange: (updater: (previous: Date) => Date) => void;
  onRemoveSharedGoal: (goalId: string) => void;
}

export function SharedGoalsCard({
  sharedGoals,
  sharedOwners,
  completionsByGoal,
  sharedMonthCursor,
  onSharedMonthCursorChange,
  onRemoveSharedGoal,
}: SharedGoalsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Shared with me</CardTitle>
        <CardDescription>
          Read-only goals from other users with Insights-style visual summaries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <PeriodStepper
            onPrevious={() =>
              onSharedMonthCursorChange((previous) => subMonths(previous, 1))
            }
            onNext={() => onSharedMonthCursorChange((previous) => addMonths(previous, 1))}
            center={
              <span className="min-w-[120px] text-center text-sm font-medium text-muted-foreground">
                {format(sharedMonthCursor, "MMMM yyyy")}
              </span>
            }
            previousAriaLabel="Previous month"
            nextAriaLabel="Next month"
          />
        </div>
        {sharedGoals.length === 0 ? (
          <StateCard
            title="No goals have been shared with you yet."
            compact
            dashed
            className="bg-background/60"
          />
        ) : (
          sharedGoals.map((goal) => {
            const owner = sharedOwners[goal.id];
            const ownerCompletions = (completionsByGoal.get(goal.id) ?? []).filter(
              (entry) => entry.user_id === goal.owner_id
            );
            const countsByDate = ownerCompletions.reduce<Record<string, number>>(
              (accumulator, completion) => {
                accumulator[completion.completed_on] =
                  (accumulator[completion.completed_on] ?? 0) + 1;
                return accumulator;
              },
              {}
            );
            const percent = getGoalCompletionPercentage(goal, ownerCompletions);
            const milestoneTargetCount = Math.max(goal.target_count ?? ownerCompletions.length, 1);
            const milestoneCompletionDates = getSortedCompletionDates(ownerCompletions).slice(
              0,
              milestoneTargetCount
            );
            const milestoneNames = buildMilestoneNames(milestoneTargetCount, goal.milestone_names);

            return (
              <Card key={goal.id} className="border shadow-none">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        shared by @{owner?.username ?? "unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {owner?.display_name || "No display name"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{Math.round(percent)}%</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveSharedGoal(goal.id)}
                      >
                        <UserMinus className="size-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                  {goal.frequency_type === "fixed_milestones" ? (
                    <MilestonePills
                      targetCount={milestoneTargetCount}
                      completionDates={milestoneCompletionDates}
                      milestoneNames={milestoneNames}
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Read-only. You can view progress and insights but cannot mark completions.
                  </p>
                  <MonthHeatmap month={sharedMonthCursor} countsByDate={countsByDate} />
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
