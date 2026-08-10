"use client";

import { Crown, Trash2, UserMinus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StateCard } from "@/components/ui/state-card";
import {
  GroupGoalCreatorCard,
  type GroupGoalDraft,
} from "@/features/social/group-goal-creator-card";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import type { Completion, Goal, GoalParticipant, Profile } from "@/lib/goals/types";

interface GroupGoalsCardProps {
  draft: GroupGoalDraft;
  saving: boolean;
  requiresEndDate: boolean;
  onDraftChange: (updater: (previous: GroupGoalDraft) => GroupGoalDraft) => void;
  onFrequencyTypeChange: (nextFrequency: GroupGoalDraft["frequencyType"]) => void;
  onCreateGoal: () => void;
  groupGoals: Goal[];
  participants: GoalParticipant[];
  completionsByGoal: Map<string, Completion[]>;
  profileDirectory: Record<string, Profile>;
  currentUserId: string;
  onDeleteGroupGoal: (goalId: string) => void;
  onLeaveGroup: (goalId: string) => void;
  onRemoveParticipant: (goalId: string, participantUserId: string) => void;
}

export function GroupGoalsCard({
  draft,
  saving,
  requiresEndDate,
  onDraftChange,
  onFrequencyTypeChange,
  onCreateGoal,
  groupGoals,
  participants,
  completionsByGoal,
  profileDirectory,
  currentUserId,
  onDeleteGroupGoal,
  onLeaveGroup,
  onRemoveParticipant,
}: GroupGoalsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Group goals</CardTitle>
        <CardDescription>Create collaborative goals and compare progress side-by-side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GroupGoalCreatorCard
          draft={draft}
          saving={saving}
          requiresEndDate={requiresEndDate}
          onDraftChange={onDraftChange}
          onFrequencyTypeChange={onFrequencyTypeChange}
          onCreateGoal={onCreateGoal}
        />

        {groupGoals.length === 0 ? (
          <StateCard
            title="No group goals available yet."
            compact
            dashed
            className="bg-background/60"
          />
        ) : (
          groupGoals.map((goal) => {
            const goalParticipants = participants.filter(
              (participant) => participant.goal_id === goal.id
            );
            const completionRows = completionsByGoal.get(goal.id) ?? [];
            const isOwner = goal.owner_id === currentUserId;

            return (
              <Card key={goal.id} className="border shadow-none">
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {goal.description || "No description"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/goals/${goal.id}`}>Edit</Link>
                      </Button>
                      {isOwner ? (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => onDeleteGroupGoal(goal.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => onLeaveGroup(goal.id)}
                        >
                          <UserMinus className="size-3.5" />
                          Leave
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Participant progress
                    </p>
                    {goalParticipants.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No participants yet.</p>
                    ) : (
                      goalParticipants.map((participant) => {
                        const profile = profileDirectory[participant.user_id];
                        const personalCompletions = completionRows.filter(
                          (entry) => entry.user_id === participant.user_id
                        );
                        const percent = getGoalCompletionPercentage(goal, personalCompletions);
                        const roleLabel = participant.role === "owner" ? "Owner" : "Participant";

                        return (
                          <div
                            key={participant.id}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                @{profile?.username ?? "unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {roleLabel} · {Math.round(percent)}%
                              </p>
                            </div>
                            {isOwner && participant.user_id !== currentUserId ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                type="button"
                                onClick={() =>
                                  onRemoveParticipant(goal.id, participant.user_id)
                                }
                              >
                                <UserMinus className="size-3.5" />
                              </Button>
                            ) : participant.role === "owner" ? (
                              <Badge variant="secondary" className="inline-flex items-center gap-1">
                                <Crown className="size-3" />
                                Owner
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
