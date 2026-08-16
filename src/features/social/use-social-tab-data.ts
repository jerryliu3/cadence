"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_MAIN_PAGE_PREFERENCE,
  DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
  normalizeDefaultMainPagePreference,
  normalizePlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import {
  getAvatarUrlValidationError,
  normalizeAvatarUrlDraft,
} from "@/features/social/avatar-url";
import { groupCompletionsByGoalId } from "@/lib/goals/completion-grouping";
import type {
  Completion,
  Goal,
  GoalShare,
  Profile,
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
  completions: [],
  profileDirectory: {},
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
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
    default_main_page: DEFAULT_MAIN_PAGE_PREFERENCE,
    planner_primary_tab: DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
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

    const [profileResponse, ownGoalsResponse, sharesResponse] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("goals")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      supabase.from("goal_shares").select("*").eq("shared_with", user.id),
    ]);

    const profile = (profileResponse.data ?? null) as Profile | null;
    const ownGoals = (ownGoalsResponse.data ?? []) as Goal[];
    const sharedEntries = (sharesResponse.data ?? []) as GoalShare[];

    setProfileDraft({
      username: profile?.username ?? "",
      display_name: profile?.display_name ?? "",
      avatar_url: profile?.avatar_url ?? "",
      default_main_page: normalizeDefaultMainPagePreference(
        profile?.default_main_page
      ),
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        profile?.planner_primary_tab
      ),
    });

    const sharedGoalIds = sharedEntries.map((entry) => entry.goal_id);
    const ownShareableGoalIds = ownGoals
      .filter((goal) => goal.team_id == null)
      .map((goal) => goal.id);

    const [sharedGoalsResponse, outgoingSharesResponse] = await Promise.all([
      sharedGoalIds.length > 0
        ? supabase
            .from("goals")
            .select("*")
            .in("id", sharedGoalIds)
            .eq("is_deleted", false)
        : Promise.resolve({ data: [], error: null } as const),
      ownShareableGoalIds.length > 0
        ? supabase.from("goal_shares").select("*").in("goal_id", ownShareableGoalIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    const sharedGoals = (sharedGoalsResponse.data ?? []) as Goal[];
    const outgoingShares = (outgoingSharesResponse.data ?? []) as GoalShare[];
    const allGoalIds = sharedGoals.map((goal) => goal.id);

    const completionsResponse =
      allGoalIds.length > 0
        ? await supabase.from("completions").select("*").in("goal_id", allGoalIds)
        : ({ data: [], error: null } as const);
    const completions = (completionsResponse.data ?? []) as Completion[];

    const profileIds = Array.from(
      new Set([
        ...sharedGoals.map((goal) => goal.owner_id),
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
    () => state.ownGoals.filter((goal) => goal.team_id == null),
    [state.ownGoals]
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

  const normalizedProfileDraft = useMemo(
    () => ({
      username: profileDraft.username.trim().toLowerCase(),
      display_name: profileDraft.display_name.trim() || null,
      avatar_url: normalizeAvatarUrlDraft(profileDraft.avatar_url),
      default_main_page: normalizeDefaultMainPagePreference(
        profileDraft.default_main_page
      ),
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        profileDraft.planner_primary_tab
      ),
    }),
    [
      profileDraft.avatar_url,
      profileDraft.default_main_page,
      profileDraft.display_name,
      profileDraft.planner_primary_tab,
      profileDraft.username,
    ]
  );
  const normalizedPersistedProfile = useMemo(
    () => ({
      username: state.profile?.username?.trim().toLowerCase() ?? "",
      display_name: state.profile?.display_name?.trim() || null,
      avatar_url: state.profile?.avatar_url?.trim() || null,
      default_main_page: normalizeDefaultMainPagePreference(
        state.profile?.default_main_page
      ),
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        state.profile?.planner_primary_tab
      ),
    }),
    [
      state.profile?.avatar_url,
      state.profile?.default_main_page,
      state.profile?.display_name,
      state.profile?.planner_primary_tab,
      state.profile?.username,
    ]
  );
  const profileDirty =
    normalizedProfileDraft.username !== normalizedPersistedProfile.username ||
    normalizedProfileDraft.display_name !== normalizedPersistedProfile.display_name ||
    normalizedProfileDraft.avatar_url !== normalizedPersistedProfile.avatar_url ||
    normalizedProfileDraft.default_main_page !==
      normalizedPersistedProfile.default_main_page ||
    normalizedProfileDraft.planner_primary_tab !==
      normalizedPersistedProfile.planner_primary_tab;
  const avatarUrlError = useMemo(
    () => getAvatarUrlValidationError(normalizedProfileDraft.avatar_url),
    [normalizedProfileDraft.avatar_url]
  );
  const canSaveProfile = Boolean(state.userId) && profileDirty && !avatarUrlError;

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
      default_main_page: normalizedProfileDraft.default_main_page,
      planner_primary_tab: normalizedProfileDraft.planner_primary_tab,
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
    shareMenuOpen,
    setShareMenuOpen,
    shareMenuPosition,
    setShareMenuPosition,
    sharedMonthCursor,
    setSharedMonthCursor,
    profileDraft,
    setProfileDraft,
    visibleSearchResults,
    shareableGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    avatarUrlError,
    canSaveProfile,
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    signOut,
  };
}
