"use client";

import { UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StateCard } from "@/components/ui/state-card";
import type { Goal, GoalShare, Profile } from "@/lib/goals/types";

interface SharedByMeCardProps {
  sharedByMeGoals: Goal[];
  outgoingSharesByGoal: Map<string, GoalShare[]>;
  profileDirectory: Record<string, Profile>;
  onRevokeGoalShare: (goalId: string, sharedWithUserId: string) => void;
}

export function SharedByMeCard({
  sharedByMeGoals,
  outgoingSharesByGoal,
  profileDirectory,
  onRevokeGoalShare,
}: SharedByMeCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Shared by me</CardTitle>
        <CardDescription>
          Manage who can see each read-only goal you have shared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sharedByMeGoals.length === 0 ? (
          <StateCard title="You have not shared any goals yet." compact dashed className="bg-background/60" />
        ) : (
          sharedByMeGoals.map((goal) => {
            const shares = outgoingSharesByGoal.get(goal.id) ?? [];
            return (
              <Card key={`shared-by-me-${goal.id}`} className="border shadow-none">
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Shared with {shares.length} {shares.length === 1 ? "person" : "people"}
                      </p>
                    </div>
                    <Badge variant="outline">{shares.length}</Badge>
                  </div>
                  {shares.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active recipients.</p>
                  ) : (
                    <div className="space-y-2">
                      {shares.map((entry) => {
                        const recipient = profileDirectory[entry.shared_with];
                        return (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                @{recipient?.username ?? "unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {recipient?.display_name || "No display name"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              type="button"
                              onClick={() => onRevokeGoalShare(goal.id, entry.shared_with)}
                            >
                              <UserMinus className="size-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
