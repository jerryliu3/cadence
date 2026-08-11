"use client";

import Link from "next/link";
import { Crown, Plus, Trash2, UserMinus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelect, GoalTypeToggle, RecurrenceIntervalToggle, TargetCountField } from "@/features/goals/goal-field-kit";
import { GoalDateRangeFields } from "@/features/goals/goal-schedule-fields";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import type { Completion, Goal, GoalParticipant, Profile } from "@/lib/goals/types";
import type { GroupGoalDraft } from "@/features/social/use-social-tab-data";

interface GroupGoalsSectionProps {
  groupDraft: GroupGoalDraft;
  setGroupDraft: (
    updater: (previous: GroupGoalDraft) => GroupGoalDraft
  ) => void;
  groupRequiresEndDate: boolean;
  updateGroupFrequencyType: (nextFrequency: GroupGoalDraft["frequencyType"]) => void;
  createGroupGoal: () => Promise<void>;
  saving: boolean;
  groupGoals: Goal[];
  participants: GoalParticipant[];
  completionsByGoal: Map<string, Completion[]>;
  currentUserId: string;
  profileDirectory: Record<string, Profile>;
  deleteGroupGoal: (goalId: string) => Promise<void>;
  leaveGroup: (goalId: string) => Promise<void>;
  removeParticipant: (goalId: string, participantUserId: string) => Promise<void>;
}

export function GroupGoalsSection({
  groupDraft,
  setGroupDraft,
  groupRequiresEndDate,
  updateGroupFrequencyType,
  createGroupGoal,
  saving,
  groupGoals,
  participants,
  completionsByGoal,
  currentUserId,
  profileDirectory,
  deleteGroupGoal,
  leaveGroup,
  removeParticipant,
}: GroupGoalsSectionProps) {
  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Group goals</CardTitle>
          <CardDescription>
            Create collaborative goals and compare progress side-by-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="mb-3 text-sm font-medium">Create group goal</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group-goal-title">Title</Label>
                <Input
                  id="group-goal-title"
                  placeholder="Title"
                  value={groupDraft.title}
                  onChange={(event) =>
                    setGroupDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <CategorySelect
                  value={groupDraft.categorySelection}
                  onValueChange={(value) =>
                    setGroupDraft((prev) => ({ ...prev, categorySelection: value }))
                  }
                  placeholder="Category"
                />
              </div>
              <div className="space-y-2">
                <Label>Goal type</Label>
                <GoalTypeToggle
                  value={groupDraft.frequencyType}
                  onValueChange={updateGroupFrequencyType}
                />
              </div>
              {groupDraft.frequencyType === "recurring" ? (
                <div className="space-y-2">
                  <Label>Recurrence interval</Label>
                  <RecurrenceIntervalToggle
                    value={groupDraft.recurrenceInterval}
                    onValueChange={(value) =>
                      setGroupDraft((prev) => ({
                        ...prev,
                        recurrenceInterval: value,
                      }))
                    }
                  />
                </div>
              ) : null}
              {groupDraft.frequencyType === "fixed_milestones" ||
              groupDraft.frequencyType === "recurring" ? (
                <div className="space-y-2">
                  <Label htmlFor="group-target-count">
                    {groupDraft.frequencyType === "fixed_milestones"
                      ? "Target count"
                      : "Target completions (optional)"}
                  </Label>
                  <TargetCountField
                    id="group-target-count"
                    frequencyType={groupDraft.frequencyType}
                    value={groupDraft.targetCount}
                    onValueChange={(value) =>
                      setGroupDraft((prev) => ({ ...prev, targetCount: value }))
                    }
                  />
                </div>
              ) : null}
              <GoalDateRangeFields
                startDate={groupDraft.startDate}
                endDate={groupDraft.endDate}
                onStartDateChange={(value) =>
                  setGroupDraft((previous) => ({ ...previous, startDate: value }))
                }
                onEndDateChange={(value) =>
                  setGroupDraft((previous) => ({ ...previous, endDate: value }))
                }
                requiresEndDate={groupRequiresEndDate}
                startDateId="group-start-date"
                endDateId="group-end-date"
              />
            </div>
            <Input
              className="mt-3"
              placeholder="Description"
              value={groupDraft.description}
              onChange={(event) =>
                setGroupDraft((prev) => ({ ...prev, description: event.target.value }))
              }
            />
            {groupDraft.categorySelection === "custom" ? (
              <Input
                className="mt-3"
                placeholder="Custom category label"
                value={groupDraft.customCategory}
                onChange={(event) =>
                  setGroupDraft((prev) => ({
                    ...prev,
                    customCategory: event.target.value,
                  }))
                }
              />
            ) : null}
            <Button
              className="mt-3"
              type="button"
              onClick={() => void createGroupGoal()}
              disabled={saving}
            >
              <Plus className="size-4" />
              Create group goal
            </Button>
          </div>

          {groupGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No group goals available yet.</p>
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
                            onClick={() => void deleteGroupGoal(goal.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => void leaveGroup(goal.id)}
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
                          const percent = getGoalCompletionPercentage(
                            goal,
                            personalCompletions
                          );
                          const roleLabel =
                            participant.role === "owner" ? "Owner" : "Participant";
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
                                    void removeParticipant(goal.id, participant.user_id)
                                  }
                                >
                                  <UserMinus className="size-3.5" />
                                </Button>
                              ) : participant.role === "owner" ? (
                                <Badge
                                  variant="secondary"
                                  className="inline-flex items-center gap-1"
                                >
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

      <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="inline-flex items-center gap-1">
          <Users className="size-3" />
          Group participants track completions independently, and owner links
          never auto-complete another user&apos;s goals.
        </p>
      </div>
    </>
  );
}
