"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type CategorySelection,
  getCategoryKeyForSelection,
  getCategoryLabel,
} from "@/lib/goals/category";
import { groupCompletionsByGoalId } from "@/lib/goals/completion-grouping";
import {
  isOrdinalGoalDefinition,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import { toLocalDateString } from "@/lib/dates/day";
import type {
  Completion,
  Goal,
  GoalFrequencyType,
  GoalParticipant,
  GoalShare,
  Profile,
  RecurrenceInterval,
} from "@/lib/goals/types";
import { unsubscribeCurrentBrowser } from "@/lib/push/client";
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

export interface ShareMenuPosition {
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

function parsePositiveTargetCount(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export interface GroupGoalDraft {
  title: string;
  description: string;
  categorySelection: CategorySelection;
  customCategory: string;
  frequencyType: GoalFrequencyType;
  recurrenceInterval: RecurrenceInterval;
  targetCount: string;
  startDate: string;
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
  startDate: toLocalDateString(),
  endDate: "",
};

export function useSocialTabData() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [state, setState] = useState<SocialState>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedShareGoalIds, setSelectedShareGoalIds] = useState<string[]>(
    []
  );
  const [selectedGroupGoalId, setSelectedGroupGoalId] = useState("");
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState<ShareMenuPosition>(
    {
      left: 0,
      width: 0,
      maxHeight: 280,
      top: 0,
    }
  );
  const [sharedMonthCursor, setSharedMonthCursor] = useState(new Date());
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
      setAuthEmail("");
      setLoading(false);
      return;
    }
    setAuthEmail(user.email ?? "");

    const [profileResponse, ownGoalsResponse, sharesResponse, membershipsResponse] =
      await Promise.all([
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

    const [sharedGoalsResponse, groupGoalsResponse, outgoingSharesResponse] =
      await Promise.all([
        sharedGoalIds.length > 0
          ? supabase
              .from("goals")
              .select("*")
              .in("id", sharedGoalIds)
              .eq("is_deleted", false)
          : Promise.resolve({ data: [], error: null } as const),
        supabase
          .from("goals")
          .select("*")
          .eq("is_group", true)
          .eq("is_deleted", false),
        ownShareableGoalIds.length > 0
          ? supabase.from("goal_shares").select("*").in("goal_id", ownShareableGoalIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);

    const sharedGoals = (sharedGoalsResponse.data ?? []) as Goal[];
    const outgoingShares = (outgoingSharesResponse.data ?? []) as GoalShare[];
    const visibleGroupGoals = ((groupGoalsResponse.data ?? []) as Goal[]).filter(
      (goal) => {
        return (
          goal.owner_id === user.id ||
          memberships.some((entry) => entry.goal_id === goal.id)
        );
      }
    );

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
    const profileById = profileDirectory.reduce<Record<string, Profile>>(
      (accumulator, item) => {
        accumulator[item.id] = item;
        return accumulator;
      },
      {}
    );

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
    () =>
      shareableGoals.filter(
        (goal) => (outgoingSharesByGoal.get(goal.id)?.length ?? 0) > 0
      ),
    [outgoingSharesByGoal, shareableGoals]
  );
  const completionsByGoal = useMemo(
    () => groupCompletionsByGoalId(state.completions),
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

  const updateGroupFrequencyType = (
    nextFrequency: GroupGoalDraft["frequencyType"]
  ) => {
    setGroupDraft((previous) => ({
      ...previous,
      frequencyType: nextFrequency,
      targetCount:
        nextFrequency === "fixed_milestones" &&
        previous.targetCount.trim().length === 0
          ? "3"
          : previous.targetCount,
    }));
  };

  const normalizedProfileDraft = useMemo(
    () => ({
      username: profileDraft.username.trim().toLowerCase(),
      display_name: profileDraft.display_name.trim() || null,
      avatar_url: profileDraft.avatar_url.trim() || null,
    }),
    [profileDraft.avatar_url, profileDraft.display_name, profileDraft.username]
  );
  const normalizedPersistedProfile = useMemo(
    () => ({
      username: state.profile?.username?.trim().toLowerCase() ?? "",
      display_name: state.profile?.display_name?.trim() || null,
      avatar_url: state.profile?.avatar_url?.trim() || null,
    }),
    [state.profile?.avatar_url, state.profile?.display_name, state.profile?.username]
  );
  const profileDirty =
    normalizedProfileDraft.username !== normalizedPersistedProfile.username ||
    normalizedProfileDraft.display_name !== normalizedPersistedProfile.display_name ||
    normalizedProfileDraft.avatar_url !== normalizedPersistedProfile.avatar_url;
  const canSaveProfile = Boolean(state.userId) && profileDirty;

  const saveProfile = async () => {
    if (!canSaveProfile) {
      return;
    }
    setSaving(true);
    const payload = {
      id: state.userId,
      username: normalizedProfileDraft.username,
      display_name: normalizedProfileDraft.display_name,
      avatar_url: normalizedProfileDraft.avatar_url,
    };

    const { error } = await supabase.from("profiles").upsert(payload, {
      onConflict: "id",
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile saved.");
      await loadData();
    }
    setSaving(false);
  };

  const shareGoalWithUser = async (targetUserId: string) => {
    if (activeSelectedShareGoalIds.length === 0) {
      toast.error("Select at least one goal to share.");
      return;
    }

    const existingGoalIds = new Set(
      state.outgoingShares
        .filter((entry) => entry.shared_with === targetUserId)
        .map((entry) => entry.goal_id)
    );
    const newGoalIds = activeSelectedShareGoalIds.filter(
      (goalId) => !existingGoalIds.has(goalId)
    );

    if (newGoalIds.length === 0) {
      toast("All selected goals are already shared with this user.");
      return;
    }

    const { error } = await supabase
      .from("goal_shares")
      .insert(
        newGoalIds.map((goalId) => ({ goal_id: goalId, shared_with: targetUserId }))
      );

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        newGoalIds.length === 1 ? "Shared 1 goal." : `Shared ${newGoalIds.length} goals.`
      );
      setShareMenuOpen(false);
      await loadData();
    }
  };

  const revokeGoalShare = async (goalId: string, sharedWithUserId: string) => {
    const { error } = await supabase
      .from("goal_shares")
      .delete()
      .eq("goal_id", goalId)
      .eq("shared_with", sharedWithUserId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Removed access.");
      await loadData();
    }
  };

  const removeSharedGoalForMe = async (goalId: string) => {
    const { error } = await supabase
      .from("goal_shares")
      .delete()
      .eq("goal_id", goalId)
      .eq("shared_with", state.userId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Removed from shared goals.");
      await loadData();
    }
  };

  const inviteToGroupGoal = async (targetUserId: string) => {
    if (!selectedGroupGoalId) {
      toast.error("Choose a group goal first.");
      return;
    }

    const { error } = await supabase.rpc("add_goal_participant", {
      p_goal_id: selectedGroupGoalId,
      p_user_id: targetUserId,
      p_role: "participant",
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

    if (!groupDraft.startDate) {
      toast.error("Start date is required.");
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
      parsedGroupTargetCount === null
    ) {
      toast.error("Milestone group goals need a positive target.");
      return;
    }

    const definitionIssues = validateGoalDefinition({
      frequencyType: groupDraft.frequencyType,
      targetCount: groupDefinitionTargetCount,
      startDate: groupDraft.startDate,
      endDate: groupDraft.endDate || null,
    });
    if (definitionIssues.length > 0) {
      toast.error(definitionIssues[0]!.message);
      return;
    }

    setSaving(true);
    const newGroupGoalId = crypto.randomUUID();
    const { error } = await supabase.rpc("create_group_goal", {
      p_id: newGroupGoalId,
      p_title: groupDraft.title.trim(),
      p_description: groupDraft.description.trim() || undefined,
      p_category: getCategoryLabel(
        groupDraft.categorySelection,
        groupDraft.customCategory
      ),
      p_category_key: getCategoryKeyForSelection(groupDraft.categorySelection),
      p_color: "#0ea5e9",
      p_frequency_type: groupDraft.frequencyType,
      p_recurrence_interval:
        groupDraft.frequencyType === "recurring"
          ? groupDraft.recurrenceInterval
          : undefined,
      p_target_count:
        groupDraft.frequencyType === "fixed_milestones"
          ? parsedGroupTargetCount ?? undefined
          : groupDraft.frequencyType === "recurring" &&
              groupDraft.targetCount.trim().length > 0
            ? parsedGroupTargetCount ?? undefined
            : undefined,
      p_start_date: groupDraft.startDate,
      p_end_date: groupDraft.endDate || undefined,
    });

    if (error) {
      toast.error(error.message ?? "Could not create group goal.");
      setSaving(false);
      return;
    }

    toast.success("Group goal created.");
    setGroupDraft({
      ...defaultGroupDraft,
      startDate: toLocalDateString(),
    });
    await loadData();
    setSaving(false);
  };

  const removeParticipant = async (goalId: string, participantUserId: string) => {
    const { error } = await supabase.rpc("remove_goal_participant", {
      p_goal_id: goalId,
      p_user_id: participantUserId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Participant removed.");
      await loadData();
    }
  };

  const leaveGroup = async (goalId: string) => {
    const { error } = await supabase.rpc("remove_goal_participant", {
      p_goal_id: goalId,
      p_user_id: state.userId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("You left the group goal.");
      await loadData();
    }
  };

  const deleteGroupGoal = async (goalId: string) => {
    const { error } = await supabase.rpc("soft_delete_goal", {
      p_goal_id: goalId,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Group goal deleted.");
      await loadData();
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await unsubscribeCurrentBrowser();
    } catch (error) {
      console.error(
        "Failed to remove push subscription while signing out:",
        error
      );
    }

    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setSigningOut(false);
  };

  return {
    state,
    loading,
    saving,
    signingOut,
    authEmail,
    searchTerm,
    setSearchTerm,
    selectedShareGoalIds,
    setSelectedShareGoalIds,
    selectedGroupGoalId,
    setSelectedGroupGoalId,
    shareMenuOpen,
    setShareMenuOpen,
    shareMenuPosition,
    setShareMenuPosition,
    sharedMonthCursor,
    setSharedMonthCursor,
    groupDraft,
    setGroupDraft,
    profileDraft,
    setProfileDraft,
    visibleSearchResults,
    shareableGoals,
    ownGroupGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    groupRequiresEndDate,
    updateGroupFrequencyType,
    canSaveProfile,
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    inviteToGroupGoal,
    createGroupGoal,
    removeParticipant,
    leaveGroup,
    deleteGroupGoal,
    signOut,
  };
}
