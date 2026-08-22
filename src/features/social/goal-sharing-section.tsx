"use client";

import { addMonths, format, subMonths } from "date-fns";
import { ChevronDown, Search, Share2, UserMinus } from "lucide-react";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { MilestonePills } from "@/features/goals/milestone-pills";
import { buildMilestoneNames } from "@/lib/goals/milestones";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import type {
  Completion,
  Goal,
  GoalShare,
  Profile,
} from "@/lib/goals/types";
import { getSortedCompletionDates } from "@/lib/goals/completion-grouping";
import type { ShareMenuPosition } from "@/features/social/use-social-tab-data";

interface GoalSharingSectionProps {
  shareMenuAnchorRef: RefObject<HTMLDivElement | null>;
  shareMenuPanelRef: RefObject<HTMLDivElement | null>;
  shareMenuOpen: boolean;
  setShareMenuOpen: Dispatch<SetStateAction<boolean>>;
  updateShareMenuPosition: () => void;
  shareableGoals: Goal[];
  activeSelectedShareGoalIds: string[];
  setSelectedShareGoalIds: Dispatch<SetStateAction<string[]>>;
  shareMenuPosition: ShareMenuPosition;
  shareMenuListMaxHeight: number;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  visibleSearchResults: Profile[];
  shareGoalWithUser: (targetUserId: string) => Promise<void>;
  sharedByMeGoals: Goal[];
  outgoingSharesByGoal: Map<string, GoalShare[]>;
  profileDirectory: Record<string, Profile>;
  revokeGoalShare: (goalId: string, sharedWithUserId: string) => Promise<void>;
  sharedMonthCursor: Date;
  setSharedMonthCursor: Dispatch<SetStateAction<Date>>;
  sharedGoals: Goal[];
  sharedOwners: Record<string, Profile>;
  completionsByGoal: Map<string, Completion[]>;
  removeSharedGoalForMe: (goalId: string) => Promise<void>;
}

export function GoalSharingSection({
  shareMenuAnchorRef,
  shareMenuPanelRef,
  shareMenuOpen,
  setShareMenuOpen,
  updateShareMenuPosition,
  shareableGoals,
  activeSelectedShareGoalIds,
  setSelectedShareGoalIds,
  shareMenuPosition,
  shareMenuListMaxHeight,
  searchTerm,
  setSearchTerm,
  visibleSearchResults,
  shareGoalWithUser,
  sharedByMeGoals,
  outgoingSharesByGoal,
  profileDirectory,
  revokeGoalShare,
  sharedMonthCursor,
  setSharedMonthCursor,
  sharedGoals,
  sharedOwners,
  completionsByGoal,
  removeSharedGoalForMe,
}: GoalSharingSectionProps) {
  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>User search</CardTitle>
          <CardDescription>
            Share goals for others to view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
              <Label>Goals to share (view only)</Label>
              <div ref={shareMenuAnchorRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={shareMenuOpen}
                  className="flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => {
                    setShareMenuOpen((previous) => {
                      const next = !previous;
                      if (next) {
                        updateShareMenuPosition();
                      }
                      return next;
                    });
                  }}
                >
                  <span className="truncate text-muted-foreground">
                    {activeSelectedShareGoalIds.length === 0
                      ? "Choose one or more goals"
                      : activeSelectedShareGoalIds.length === 1
                        ? shareableGoals.find(
                            (goal) => goal.id === activeSelectedShareGoalIds[0]
                          )?.title ?? "1 goal selected"
                        : `${activeSelectedShareGoalIds.length} goals selected`}
                  </span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${
                      shareMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

          {shareMenuOpen ? (
            <div
              ref={shareMenuPanelRef}
              className="fixed z-[70] rounded-xl border bg-popover p-2 shadow-md"
              style={{
                left: shareMenuPosition.left,
                width: shareMenuPosition.width,
                top: shareMenuPosition.top,
                bottom: shareMenuPosition.bottom,
                maxHeight: shareMenuPosition.maxHeight,
              }}
            >
              {shareableGoals.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  You do not have any shareable goals yet.
                </p>
              ) : (
                <>
                  <div
                    className="space-y-1 overflow-auto pr-1 overscroll-contain"
                    style={{ maxHeight: shareMenuListMaxHeight }}
                  >
                    {shareableGoals.map((goal) => {
                      const checked = activeSelectedShareGoalIds.includes(goal.id);
                      return (
                        <label
                          key={goal.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedShareGoalIds((previous) =>
                                checked
                                  ? previous.filter((goalId) => goalId !== goal.id)
                                  : [...previous, goal.id]
                              )
                            }
                          />
                          <span className="truncate">{goal.title}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() =>
                        setSelectedShareGoalIds(shareableGoals.map((goal) => goal.id))
                      }
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline"
                      onClick={() => setSelectedShareGoalIds([])}
                    >
                      Clear all
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="search-users">Find users by username</Label>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-users"
                className="pl-9"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="e.g. alex"
              />
            </div>
          </div>

          <div className="space-y-2">
            {visibleSearchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches yet.</p>
            ) : (
              visibleSearchResults.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">@{profile.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.display_name || "No display name"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => void shareGoalWithUser(profile.id)}
                    >
                      <Share2 className="size-3.5" />
                      Share selected
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Shared by me</CardTitle>
          <CardDescription>
            Manage who can view each goal you've shared.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sharedByMeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not shared any goals yet.
            </p>
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
                          Shared with {shares.length}{" "}
                          {shares.length === 1 ? "person" : "people"}
                        </p>
                      </div>
                      <Badge variant="outline">{shares.length}</Badge>
                    </div>
                    {shares.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No active recipients.
                      </p>
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
                                onClick={() =>
                                  void revokeGoalShare(goal.id, entry.shared_with)
                                }
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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Shared with me</CardTitle>
          <CardDescription>
            Goals shared with you, with visual progress summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <PeriodStepper
              onPrevious={() =>
                setSharedMonthCursor((previous) => subMonths(previous, 1))
              }
              onNext={() =>
                setSharedMonthCursor((previous) => addMonths(previous, 1))
              }
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
            <p className="text-sm text-muted-foreground">
              No goals have been shared with you yet.
            </p>
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
              const milestoneTargetCount = Math.max(
                goal.target_count ?? ownerCompletions.length,
                1
              );
              const milestoneCompletionDates = getSortedCompletionDates(
                ownerCompletions
              ).slice(0, milestoneTargetCount);
              const milestoneNames = buildMilestoneNames(
                milestoneTargetCount,
                goal.milestone_names
              );
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
                          onClick={() => void removeSharedGoalForMe(goal.id)}
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
                      View only. You can see progress and insights but cannot mark
                      completions.
                    </p>
                    <MonthHeatmap month={sharedMonthCursor} countsByDate={countsByDate} />
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
