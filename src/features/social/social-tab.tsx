"use client";

import { format } from "date-fns";
import {
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategoryLabel,
} from "@/lib/goals/category";
import { getGoalCompletionPercentage } from "@/lib/goals/progress";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import type {
  Completion,
  Goal,
  GoalParticipant,
  GoalShare,
  Profile,
  RecurrenceInterval,
} from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface SocialState {
  userId: string;
  profile: Profile | null;
  ownGoals: Goal[];
  sharedGoals: Goal[];
  sharedEntries: GoalShare[];
  sharedOwners: Record<string, Profile>;
  groupGoals: Goal[];
  participants: GoalParticipant[];
  completions: Completion[];
  profileDirectory: Record<string, Profile>;
}

const initialState: SocialState = {
  userId: "",
  profile: null,
  ownGoals: [],
  sharedGoals: [],
  sharedEntries: [],
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

interface GroupGoalDraft {
  title: string;
  description: string;
  categorySelection: CategorySelection;
  customCategory: string;
  frequencyType: "fixed_milestones" | "recurring";
  recurrenceInterval: RecurrenceInterval;
  targetCount: string;
  endDate: string;
}

const defaultGroupDraft: GroupGoalDraft = {
  title: "",
  description: "",
  categorySelection: "personal",
  customCategory: "",
  frequencyType: "recurring",
  recurrenceInterval: "weekly",
  targetCount: "",
  endDate: "",
};

const groupFrequencyOptions: Array<{
  value: GroupGoalDraft["frequencyType"];
  label: string;
}> = [
  { value: "recurring", label: "Recurring" },
  { value: "fixed_milestones", label: "Fixed milestones" },
];

const groupRecurrenceOptions: Array<{
  value: RecurrenceInterval;
  label: string;
}> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function SocialTab() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<SocialState>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedShareGoalId, setSelectedShareGoalId] = useState("");
  const [selectedGroupGoalId, setSelectedGroupGoalId] = useState("");
  const [groupDraft, setGroupDraft] = useState<GroupGoalDraft>(defaultGroupDraft);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
  });

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
    const [sharedGoalsResponse, groupGoalsResponse] = await Promise.all([
      sharedGoalIds.length > 0
        ? supabase.from("goals").select("*").in("id", sharedGoalIds).eq("is_deleted", false)
        : Promise.resolve({ data: [], error: null } as const),
      supabase.from("goals").select("*").eq("is_group", true).eq("is_deleted", false),
    ]);

    const sharedGoals = (sharedGoalsResponse.data ?? []) as Goal[];
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
    if (!searchTerm.trim()) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", `%${searchTerm.trim().toLowerCase()}%`)
        .neq("id", state.userId)
        .limit(8);

      if (!cancelled) {
        setSearchResults((data ?? []) as Profile[]);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchTerm, state.userId, supabase]);

  const visibleSearchResults = searchTerm.trim() ? searchResults : [];

  const shareableGoals = useMemo(
    () => state.ownGoals.filter((goal) => !goal.is_group),
    [state.ownGoals]
  );

  const ownGroupGoals = useMemo(
    () => state.groupGoals.filter((goal) => goal.owner_id === state.userId),
    [state.groupGoals, state.userId]
  );

  const completionsByGoal = useMemo(
    () => groupCompletionsByGoal(state.completions),
    [state.completions]
  );

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

  const saveProfile = async () => {
    if (!state.userId) {
      return;
    }
    setSaving(true);
    const payload = {
      id: state.userId,
      username: profileDraft.username.trim().toLowerCase(),
      display_name: profileDraft.display_name.trim() || null,
      avatar_url: profileDraft.avatar_url.trim() || null,
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile saved.");
      await loadData();
    }
    setSaving(false);
  };

  const shareGoalWithUser = async (targetUserId: string) => {
    if (!selectedShareGoalId) {
      toast.error("Choose a goal to share first.");
      return;
    }
    const { error } = await supabase.from("goal_shares").insert({
      goal_id: selectedShareGoalId,
      shared_with: targetUserId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Goal shared.");
      await loadData();
    }
  };

  const inviteToGroupGoal = async (targetUserId: string) => {
    if (!selectedGroupGoalId) {
      toast.error("Choose a group goal first.");
      return;
    }

    const { error } = await supabase.from("goal_participants").insert({
      goal_id: selectedGroupGoalId,
      user_id: targetUserId,
      role: "participant",
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Participant invited.");
      await loadData();
    }
  };

  const createGroupGoal = async () => {
    if (!groupDraft.title.trim()) {
      toast.error("Group goal title is required.");
      return;
    }

    if (
      groupDraft.categorySelection === "custom" &&
      groupDraft.customCategory.trim().length === 0
    ) {
      toast.error("Custom category name is required.");
      return;
    }

    if (
      groupDraft.frequencyType === "fixed_milestones" &&
      Number.parseInt(groupDraft.targetCount, 10) <= 0
    ) {
      toast.error("Fixed milestone group goals need a positive target.");
      return;
    }

    if (
      groupDraft.frequencyType === "recurring" &&
      groupDraft.targetCount.trim().length > 0 &&
      Number.parseInt(groupDraft.targetCount, 10) <= 0
    ) {
      toast.error("Recurring target count must be positive.");
      return;
    }

    if (
      groupDraft.frequencyType === "recurring" &&
      groupDraft.targetCount.trim().length > 0 &&
      !groupDraft.endDate
    ) {
      toast.error("Recurring goals with a target count require an end date.");
      return;
    }

    setSaving(true);
    const newGroupGoalId = crypto.randomUUID();
    const { error } = await supabase.from("goals").insert({
      id: newGroupGoalId,
      owner_id: state.userId,
      title: groupDraft.title.trim(),
      description: groupDraft.description.trim() || null,
      category: getCategoryLabel(
        groupDraft.categorySelection,
        groupDraft.customCategory
      ),
      color: "#0ea5e9",
      frequency_type: groupDraft.frequencyType,
      recurrence_interval:
        groupDraft.frequencyType === "recurring" ? groupDraft.recurrenceInterval : null,
      target_count:
        groupDraft.frequencyType === "fixed_milestones"
          ? Number.parseInt(groupDraft.targetCount, 10)
          : groupDraft.frequencyType === "recurring" &&
              groupDraft.targetCount.trim().length > 0
            ? Number.parseInt(groupDraft.targetCount, 10)
          : null,
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: groupDraft.endDate || null,
      is_group: true,
    });

    if (error) {
      toast.error(error.message ?? "Could not create group goal.");
      setSaving(false);
      return;
    }

    await supabase.from("goal_participants").insert({
      goal_id: newGroupGoalId,
      user_id: state.userId,
      role: "owner",
    });

    toast.success("Group goal created.");
    setGroupDraft(defaultGroupDraft);
    await loadData();
    setSaving(false);
  };

  const removeParticipant = async (goalId: string, participantUserId: string) => {
    const { error } = await supabase
      .from("goal_participants")
      .delete()
      .eq("goal_id", goalId)
      .eq("user_id", participantUserId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Participant removed.");
      await loadData();
    }
  };

  const leaveGroup = async (goalId: string) => {
    const { error } = await supabase
      .from("goal_participants")
      .delete()
      .eq("goal_id", goalId)
      .eq("user_id", state.userId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("You left the group goal.");
      await loadData();
    }
  };

  const deleteGroupGoal = async (goalId: string) => {
    const { error } = await supabase
      .from("goals")
      .update({ is_deleted: true })
      .eq("id", goalId)
      .eq("owner_id", state.userId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Group goal deleted.");
      await loadData();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading social workspace...</CardTitle>
          <CardDescription>Syncing shared and collaborative goals.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
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
              <Label>Goal to share (read-only)</Label>
              <Select value={selectedShareGoalId} onValueChange={setSelectedShareGoalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a goal" />
                </SelectTrigger>
                <SelectContent>
                  {shareableGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      Share
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
          <CardTitle>Shared with me</CardTitle>
          <CardDescription>Read-only goals from other users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
              return (
                <Card key={goal.id} className="border shadow-none">
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{goal.title}</p>
                        <p className="text-xs text-muted-foreground">
                          shared by @{owner?.username ?? "unknown"}
                        </p>
                      </div>
                      <Badge variant="outline">{Math.round(percent)}%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Read-only. You can view progress and insights but cannot mark completions.
                    </p>
                    <MonthHeatmap month={new Date()} countsByDate={countsByDate} />
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
              <Input
                placeholder="Title"
                value={groupDraft.title}
                onChange={(event) =>
                  setGroupDraft((prev) => ({ ...prev, title: event.target.value }))
                }
              />
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
                      {preset.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2">
                {groupFrequencyOptions.map((option) => (
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
              {groupDraft.frequencyType === "recurring" ? (
                <div className="flex flex-wrap gap-2">
                  {groupRecurrenceOptions.map((option) => (
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
              ) : null}
              {groupDraft.frequencyType === "fixed_milestones" ||
              groupDraft.frequencyType === "recurring" ? (
                <Input
                  type="number"
                  min={1}
                  placeholder={
                    groupDraft.frequencyType === "fixed_milestones"
                      ? "Target count"
                      : "Target count (optional)"
                  }
                  value={groupDraft.targetCount}
                  onChange={(event) =>
                    setGroupDraft((prev) => ({ ...prev, targetCount: event.target.value }))
                  }
                />
              ) : null}
              <Input
                type="date"
                value={groupDraft.endDate}
                onChange={(event) =>
                  setGroupDraft((prev) => ({ ...prev, endDate: event.target.value }))
                }
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
