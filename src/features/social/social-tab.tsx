"use client";

import { addMonths, format, subMonths } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Plus,
  Search,
  Share2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createDefaultGroupDraft,
  type GroupGoalDraft,
  useSocialMutations,
} from "@/features/social/use-social-mutations";
import {
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import { isOrdinalGoalDefinition } from "@/lib/goals/definition-validation";
import { GOAL_TYPE_OPTIONS, RECURRENCE_INTERVAL_OPTIONS } from "@/lib/goals/form-options";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { NotificationSettings } from "@/features/settings/notification-settings";
import type {
  Completion,
  Goal,
  GoalParticipant,
  GoalShare,
  Profile,
} from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface SocialState {
  userId: string;
  profile: Profile | null;
  ownGoals: Goal[];
  sharedGoals: Goal[];
  sharedEntries: GoalShare[];
  outgoingShares: GoalShare[];
  sharedOwners: Record<string, Profile>;
  groupGoals: Goal[];
  participants: GoalParticipant[];
  completions: Completion[];
  profileDirectory: Record<string, Profile>;
}

interface ShareMenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const initialState: SocialState = {
  userId: "",
  profile: null,
  ownGoals: [],
  sharedGoals: [],
  sharedEntries: [],
  outgoingShares: [],
  sharedOwners: {},
  groupGoals: [],
  participants: [],
  completions: [],
  profileDirectory: {},
};

function groupCompletionsByGoal(completions: Completion[]) {
  const map = new Map<string, Completion[]>();
  completions.forEach((completion) => {
    const existing = map.get(completion.goal_id) ?? [];
    existing.push(completion);
    map.set(completion.goal_id, existing);
  });
  return map;
}

function getInitials(profile: Profile | null) {
  if (!profile) {
    return "??";
  }
  return (profile.display_name ?? profile.username).slice(0, 2).toUpperCase();
}

function defaultMilestoneName(index: number): string {
  return `Milestone ${index + 1}`;
}

function parsePositiveTargetCount(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function buildMilestoneNames(targetCount: number, names: string[] | null | undefined): string[] {
  const safeTarget = Math.max(targetCount, 1);
  return Array.from({ length: safeTarget }, (_, index) => {
    const value = names?.[index]?.trim();
    return value && value.length > 0 ? value : defaultMilestoneName(index);
  });
}

function getSortedCompletionDates(completions: Completion[]): string[] {
  return Array.from(new Set(completions.map((completion) => completion.completed_on))).sort((a, b) =>
    a.localeCompare(b)
  );
}

interface MilestoneSummaryPillsProps {
  targetCount: number;
  completionDates: string[];
  milestoneNames: string[];
}

function MilestoneSummaryPills({
  targetCount,
  completionDates,
  milestoneNames,
}: MilestoneSummaryPillsProps) {
  const safeTarget = Math.max(targetCount, 1);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Milestones</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: safeTarget }).map((_, index) => {
          const completionDate = completionDates[index];
          const complete = Boolean(completionDate);
          const milestoneName = milestoneNames[index] ?? defaultMilestoneName(index);

          return (
            <div
              key={`${index + 1}-shared-milestone`}
              className={`min-w-[110px] rounded-full border px-2.5 py-1 text-[11px] leading-tight ${
                complete
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <p className="truncate font-medium">{milestoneName}</p>
              <p className={complete ? "text-foreground/75" : "text-muted-foreground"}>
                {complete ? completionDate : "Pending"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SocialTab() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<SocialState>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedShareGoalIds, setSelectedShareGoalIds] = useState<string[]>([]);
  const [selectedGroupGoalId, setSelectedGroupGoalId] = useState("");
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState<ShareMenuPosition>({
    left: 0,
    width: 0,
    maxHeight: 280,
    top: 0,
  });
  const [sharedMonthCursor, setSharedMonthCursor] = useState(new Date());
  const [groupDraft, setGroupDraft] =
    useState<GroupGoalDraft>(createDefaultGroupDraft);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
  });
  const shareMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const shareMenuPanelRef = useRef<HTMLDivElement | null>(null);

  const updateShareMenuPosition = useCallback(() => {
    const anchor = shareMenuAnchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const availableAbove = rect.top - gap - viewportPadding;
    const shouldOpenAbove = availableBelow < 220 && availableAbove > availableBelow;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding
    );
    const maxHeight = Math.max(160, shouldOpenAbove ? availableAbove : availableBelow);

    if (shouldOpenAbove) {
      setShareMenuPosition({
        left,
        width,
        maxHeight,
        top: undefined,
        bottom: window.innerHeight - rect.top + gap,
      });
      return;
    }

    setShareMenuPosition({
      left,
      width,
      maxHeight,
      top: rect.bottom + gap,
      bottom: undefined,
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState(initialState);
      setLoading(false);
      return;
    }

    const [profileResponse, ownGoalsResponse, sharesResponse, membershipsResponse] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("goals")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      supabase.from("goal_shares").select("*").eq("shared_with", user.id),
      supabase.from("goal_participants").select("*").eq("user_id", user.id),
    ]);

    const profile = (profileResponse.data ?? null) as Profile | null;
    const ownGoals = (ownGoalsResponse.data ?? []) as Goal[];
    const sharedEntries = (sharesResponse.data ?? []) as GoalShare[];
    const memberships = (membershipsResponse.data ?? []) as GoalParticipant[];

    setProfileDraft({
      username: profile?.username ?? "",
      display_name: profile?.display_name ?? "",
      avatar_url: profile?.avatar_url ?? "",
    });

    const sharedGoalIds = sharedEntries.map((entry) => entry.goal_id);
    const ownShareableGoalIds = ownGoals
      .filter((goal) => !goal.is_group)
      .map((goal) => goal.id);

    const [sharedGoalsResponse, groupGoalsResponse, outgoingSharesResponse] = await Promise.all([
      sharedGoalIds.length > 0
        ? supabase.from("goals").select("*").in("id", sharedGoalIds).eq("is_deleted", false)
        : Promise.resolve({ data: [], error: null } as const),
      supabase.from("goals").select("*").eq("is_group", true).eq("is_deleted", false),
      ownShareableGoalIds.length > 0
        ? supabase.from("goal_shares").select("*").in("goal_id", ownShareableGoalIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    const sharedGoals = (sharedGoalsResponse.data ?? []) as Goal[];
    const outgoingShares = (outgoingSharesResponse.data ?? []) as GoalShare[];
    const visibleGroupGoals = ((groupGoalsResponse.data ?? []) as Goal[]).filter((goal) => {
      return goal.owner_id === user.id || memberships.some((entry) => entry.goal_id === goal.id);
    });

    const allGoalIds = Array.from(
      new Set([
        ...sharedGoals.map((goal) => goal.id),
        ...visibleGroupGoals.map((goal) => goal.id),
      ])
    );

    const [participantsResponse, completionsResponse] = await Promise.all([
      allGoalIds.length > 0
        ? supabase.from("goal_participants").select("*").in("goal_id", allGoalIds)
        : Promise.resolve({ data: [], error: null } as const),
      allGoalIds.length > 0
        ? supabase.from("completions").select("*").in("goal_id", allGoalIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    const participants = (participantsResponse.data ?? []) as GoalParticipant[];
    const completions = (completionsResponse.data ?? []) as Completion[];

    const profileIds = Array.from(
      new Set([
        ...sharedGoals.map((goal) => goal.owner_id),
        ...participants.map((entry) => entry.user_id),
        ...outgoingShares.map((entry) => entry.shared_with),
        user.id,
      ])
    );

    const profileDirectoryResponse =
      profileIds.length > 0
        ? await supabase.from("profiles").select("*").in("id", profileIds)
        : ({ data: [], error: null } as const);

    const profileDirectory = (profileDirectoryResponse.data ?? []) as Profile[];
    const profileById = profileDirectory.reduce<Record<string, Profile>>((accumulator, item) => {
      accumulator[item.id] = item;
      return accumulator;
    }, {});

    const sharedOwners: Record<string, Profile> = {};
    sharedGoals.forEach((goal) => {
      const owner = profileById[goal.owner_id];
      if (owner) {
        sharedOwners[goal.id] = owner;
      }
    });

    setState({
      userId: user.id,
      profile,
      ownGoals,
      sharedGoals,
      sharedEntries,
      outgoingShares,
      sharedOwners,
      groupGoals: visibleGroupGoals,
      participants,
      completions,
      profileDirectory: profileById,
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, [loadData]);

  useEffect(() => {
    const searchQuery = searchTerm.trim().toLowerCase();
    if (!searchQuery) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      const { data, error } = await supabase.rpc("find_profile_by_username", {
        p_query: searchQuery,
        p_limit: 8,
      });

      if (error) {
        if (!cancelled) {
          setSearchResults([]);
        }
        return;
      }

      if (!cancelled) {
        setSearchResults((data ?? []) as Profile[]);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchTerm, supabase]);

  useEffect(() => {
    if (!shareMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (shareMenuAnchorRef.current?.contains(target) || shareMenuPanelRef.current?.contains(target)) {
        return;
      }

      setShareMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareMenuOpen(false);
      }
    };

    const handleViewportChange = () => {
      updateShareMenuPosition();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [shareMenuOpen, updateShareMenuPosition]);

  const visibleSearchResults = searchTerm.trim() ? searchResults : [];

  const shareableGoals = useMemo(
    () => state.ownGoals.filter((goal) => !goal.is_group),
    [state.ownGoals]
  );

  const ownGroupGoals = useMemo(
    () => state.groupGoals.filter((goal) => goal.owner_id === state.userId),
    [state.groupGoals, state.userId]
  );

  const shareableGoalIds = useMemo(
    () => new Set(shareableGoals.map((goal) => goal.id)),
    [shareableGoals]
  );

  const activeSelectedShareGoalIds = useMemo(
    () => selectedShareGoalIds.filter((goalId) => shareableGoalIds.has(goalId)),
    [selectedShareGoalIds, shareableGoalIds]
  );
  const shareMenuListMaxHeight = Math.max(120, shareMenuPosition.maxHeight - 44);

  const outgoingSharesByGoal = useMemo(() => {
    const grouped = new Map<string, GoalShare[]>();
    state.outgoingShares.forEach((entry) => {
      const existing = grouped.get(entry.goal_id) ?? [];
      existing.push(entry);
      grouped.set(entry.goal_id, existing);
    });
    return grouped;
  }, [state.outgoingShares]);

  const sharedByMeGoals = useMemo(
    () => shareableGoals.filter((goal) => (outgoingSharesByGoal.get(goal.id)?.length ?? 0) > 0),
    [outgoingSharesByGoal, shareableGoals]
  );

  const completionsByGoal = useMemo(
    () => groupCompletionsByGoal(state.completions),
    [state.completions]
  );
  const parsedGroupTargetCount = parsePositiveTargetCount(groupDraft.targetCount);
  const groupDefinitionTargetCount =
    groupDraft.frequencyType === "fixed_milestones"
      ? parsedGroupTargetCount
      : groupDraft.targetCount.trim().length > 0
        ? parsedGroupTargetCount
        : null;
  const groupRequiresEndDate = isOrdinalGoalDefinition({
    frequencyType: groupDraft.frequencyType,
    targetCount: groupDefinitionTargetCount,
  });

  const updateGroupFrequencyType = (nextFrequency: GroupGoalDraft["frequencyType"]) => {
    setGroupDraft((previous) => ({
      ...previous,
      frequencyType: nextFrequency,
      targetCount:
        nextFrequency === "fixed_milestones" && previous.targetCount.trim().length === 0
          ? "3"
          : previous.targetCount,
    }));
  };

  const resetGroupDraft = useCallback(() => {
    setGroupDraft(createDefaultGroupDraft());
  }, []);

  const {
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    inviteToGroupGoal,
    createGroupGoal,
    removeParticipant,
    leaveGroup,
    deleteGroupGoal,
  } = useSocialMutations({
    userId: state.userId,
    profileDraft,
    outgoingShares: state.outgoingShares,
    activeSelectedShareGoalIds,
    selectedGroupGoalId,
    groupDraft,
    parsedGroupTargetCount,
    groupDefinitionTargetCount,
    loadData,
    setSaving,
    setShareMenuOpen,
    resetGroupDraft,
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading settings...</CardTitle>
          <CardDescription>
            Syncing your profile, notifications, and collaboration settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-visible shadow-sm">
        <CardHeader>
          <CardTitle>Account profile</CardTitle>
          <CardDescription>Username is used for sharing and invites.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{getInitials(state.profile)}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">
              Keep this profile updated so collaborators can find you quickly.
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-username">Username</Label>
              <Input
                id="profile-username"
                value={profileDraft.username}
                onChange={(event) =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    username: event.target.value.trim().toLowerCase(),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                value={profileDraft.display_name}
                onChange={(event) =>
                  setProfileDraft((prev) => ({ ...prev, display_name: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-avatar-url">Avatar URL (optional)</Label>
            <Input
              id="profile-avatar-url"
              value={profileDraft.avatar_url}
              onChange={(event) =>
                setProfileDraft((prev) => ({ ...prev, avatar_url: event.target.value }))
              }
            />
          </div>
          <Button type="button" onClick={saveProfile} disabled={saving}>
            <WandSparkles className="size-4" />
            Save profile
          </Button>
          <NotificationSettings />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>User search</CardTitle>
          <CardDescription>
            Share read-only goals and invite participants to your group goals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Goals to share (read-only)</Label>
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
                        ? shareableGoals.find((goal) => goal.id === activeSelectedShareGoalIds[0])
                            ?.title ?? "1 goal selected"
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
            <div className="space-y-2">
              <Label>Group goal for invitations</Label>
              <Select value={selectedGroupGoalId} onValueChange={setSelectedGroupGoalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose group goal" />
                </SelectTrigger>
                <SelectContent>
                  {ownGroupGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      onClick={() => setSelectedShareGoalIds(shareableGoals.map((goal) => goal.id))}
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
                      onClick={() => shareGoalWithUser(profile.id)}
                    >
                      <Share2 className="size-3.5" />
                      Share selected
                    </Button>
                    <Button size="sm" type="button" onClick={() => inviteToGroupGoal(profile.id)}>
                      <UserPlus className="size-3.5" />
                      Invite
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
            Manage who can see each read-only goal you have shared.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sharedByMeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not shared any goals yet.</p>
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
                          const recipient = state.profileDirectory[entry.shared_with];
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
                                onClick={() => revokeGoalShare(goal.id, entry.shared_with)}
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
            Read-only goals from other users with Insights-style visual summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setSharedMonthCursor((previous) => subMonths(previous, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[120px] text-center text-sm font-medium text-muted-foreground">
              {format(sharedMonthCursor, "MMMM yyyy")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setSharedMonthCursor((previous) => addMonths(previous, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {state.sharedGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals have been shared with you yet.</p>
          ) : (
            state.sharedGoals.map((goal) => {
              const owner = state.sharedOwners[goal.id];
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
                          onClick={() => removeSharedGoalForMe(goal.id)}
                        >
                          <UserMinus className="size-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                    {goal.frequency_type === "fixed_milestones" ? (
                      <MilestoneSummaryPills
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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Group goals</CardTitle>
          <CardDescription>Create collaborative goals and compare progress side-by-side.</CardDescription>
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
                <Select
                  value={groupDraft.categorySelection}
                  onValueChange={(value: CategorySelection) =>
                    setGroupDraft((prev) => ({ ...prev, categorySelection: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: getCategorySwatchColor(preset.id) }}
                          />
                          {preset.label}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: getCategorySwatchColor("custom") }}
                        />
                        Custom
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Goal type</Label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_TYPE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={groupDraft.frequencyType === option.value ? "secondary" : "outline"}
                      className="rounded-full"
                      onClick={() => updateGroupFrequencyType(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              {groupDraft.frequencyType === "recurring" ? (
                <div className="space-y-2">
                  <Label>Recurrence interval</Label>
                  <div className="flex flex-wrap gap-2">
                    {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={
                          groupDraft.recurrenceInterval === option.value
                            ? "secondary"
                            : "outline"
                        }
                        className="rounded-full"
                        onClick={() =>
                          setGroupDraft((prev) => ({
                            ...prev,
                            recurrenceInterval: option.value,
                          }))
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
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
                  <Input
                    id="group-target-count"
                    type="number"
                    min={groupDraft.frequencyType === "fixed_milestones" ? 1 : 0}
                    value={groupDraft.targetCount}
                    onChange={(event) =>
                      setGroupDraft((prev) => ({ ...prev, targetCount: event.target.value }))
                    }
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="group-start-date">Start date</Label>
                <Input
                  id="group-start-date"
                  type="date"
                  value={groupDraft.startDate}
                  onChange={(event) =>
                    setGroupDraft((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-end-date">
                  {groupRequiresEndDate ? "End date" : "End date (optional)"}
                </Label>
                <Input
                  id="group-end-date"
                  type="date"
                  value={groupDraft.endDate}
                  onChange={(event) =>
                    setGroupDraft((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                  required={groupRequiresEndDate}
                />
              </div>
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
            <Button className="mt-3" type="button" onClick={createGroupGoal} disabled={saving}>
              <Plus className="size-4" />
              Create group goal
            </Button>
          </div>

          {state.groupGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No group goals available yet.</p>
          ) : (
            state.groupGoals.map((goal) => {
              const goalParticipants = state.participants.filter(
                (participant) => participant.goal_id === goal.id
              );
              const completionRows = completionsByGoal.get(goal.id) ?? [];
              const isOwner = goal.owner_id === state.userId;
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
                            onClick={() => deleteGroupGoal(goal.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => leaveGroup(goal.id)}
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
                          const profile = state.profileDirectory[participant.user_id];
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
                              {isOwner && participant.user_id !== state.userId ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  type="button"
                                  onClick={() =>
                                    removeParticipant(goal.id, participant.user_id)
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

      <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="inline-flex items-center gap-1">
          <Users className="size-3" />
          Group participants track completions independently, and owner links never auto-complete
          another user’s goals.
        </p>
      </div>
    </div>
  );
}
