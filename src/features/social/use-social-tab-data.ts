"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
  normalizePlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import {
  normalizeAvatarUrlDraft,
} from "@/features/social/avatar-url";
import { getApiErrorMessage, getJson, putJson } from "@/lib/api/client";
import { invalidatePlannerRelatedTabCaches } from "@/lib/cache/planner-tab-cache";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { groupCompletionsByGoalId } from "@/lib/goals/completion-grouping";
import type {
  Completion,
  Goal,
  GoalShare,
  Profile,
} from "@/lib/goals/types";
import { createDefaultPlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";
import { unsubscribeCurrentBrowser } from "@/lib/push/client";
import { createClient } from "@/lib/supabase/client";
import type { PlannerPreferencesDraft } from "@/features/settings/planner-preferences-settings";
import { buildProfilePreferencesUpdate } from "@/features/social/profile-preferences";

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

interface PlannerPreferencesContextPayload {
  preferences: {
    timezone: string;
    defaultPolicy: {
      weekStartsOn: number;
      restWeekdays: number[];
    };
  } | null;
}

interface PlannerPreferencesState extends PlannerPreferencesDraft {
  restWeekdays: number[];
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

const defaultPlannerPreferencesState: PlannerPreferencesState = {
  timezone: resolveUserTimezone(),
  weekStartsOn: 1,
  restWeekdays: [],
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
    planner_primary_tab: DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
    social_activity_visible: true,
  });
  const [plannerPreferencesLoading, setPlannerPreferencesLoading] = useState(true);
  const [plannerPreferencesPersisted, setPlannerPreferencesPersisted] =
    useState<PlannerPreferencesState>(defaultPlannerPreferencesState);
  const [plannerPreferencesDraft, setPlannerPreferencesDraft] =
    useState<PlannerPreferencesDraft>({
      timezone: defaultPlannerPreferencesState.timezone,
      weekStartsOn: defaultPlannerPreferencesState.weekStartsOn,
    });

  const loadData = useCallback(async () => {
    setLoading(true);
    setPlannerPreferencesLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState(initialState);
      setAuthEmail("");
      setPlannerPreferencesPersisted(defaultPlannerPreferencesState);
      setPlannerPreferencesDraft({
        timezone: defaultPlannerPreferencesState.timezone,
        weekStartsOn: defaultPlannerPreferencesState.weekStartsOn,
      });
      setPlannerPreferencesLoading(false);
      setLoading(false);
      return;
    }
    setAuthEmail(user.email ?? "");
    const scopeMonth = format(new Date(), "yyyy-MM");
    const plannerContextPromise = getJson<PlannerPreferencesContextPayload>(
      "/api/planner/context",
      { query: { scopeMonth } }
    ).catch((error: unknown) => {
      toast.error(
        getApiErrorMessage(error, "Planner preferences could not be loaded.")
      );
      return null;
    });

    const [profileResponse, ownGoalsResponse, sharesResponse, plannerContext] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("goals")
          .select("*")
          .eq("owner_id", user.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false }),
        supabase.from("goal_shares").select("*").eq("shared_with", user.id),
        plannerContextPromise,
      ]);

    const profile = (profileResponse.data ?? null) as Profile | null;
    const ownGoals = (ownGoalsResponse.data ?? []) as Goal[];
    const sharedEntries = (sharesResponse.data ?? []) as GoalShare[];

    setProfileDraft({
      username: profile?.username ?? "",
      display_name: profile?.display_name ?? "",
      avatar_url: profile?.avatar_url ?? "",
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        profile?.planner_primary_tab
      ),
      social_activity_visible: profile?.social_activity_visible ?? true,
    });
    const nextPlannerPreferences: PlannerPreferencesState = plannerContext?.preferences
      ? {
          timezone: plannerContext.preferences.timezone,
          weekStartsOn: normalizeWeekStartsOn(
            plannerContext.preferences.defaultPolicy.weekStartsOn
          ),
          restWeekdays: [
            ...(plannerContext.preferences.defaultPolicy.restWeekdays ?? []),
          ].sort((left, right) => left - right),
        }
      : defaultPlannerPreferencesState;
    setPlannerPreferencesPersisted(nextPlannerPreferences);
    setPlannerPreferencesDraft({
      timezone: nextPlannerPreferences.timezone,
      weekStartsOn: nextPlannerPreferences.weekStartsOn,
    });
    setPlannerPreferencesLoading(false);

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
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        profileDraft.planner_primary_tab
      ),
      social_activity_visible: profileDraft.social_activity_visible,
    }),
    [
      profileDraft.avatar_url,
      profileDraft.display_name,
      profileDraft.planner_primary_tab,
      profileDraft.social_activity_visible,
      profileDraft.username,
    ]
  );
  const normalizedPersistedProfile = useMemo(
    () => ({
      username: state.profile?.username?.trim().toLowerCase() ?? "",
      display_name: state.profile?.display_name?.trim() || null,
      avatar_url: state.profile?.avatar_url?.trim() || null,
      planner_primary_tab: normalizePlannerPrimaryTabPreference(
        state.profile?.planner_primary_tab
      ),
      social_activity_visible: state.profile?.social_activity_visible ?? true,
    }),
    [
      state.profile?.avatar_url,
      state.profile?.display_name,
      state.profile?.planner_primary_tab,
      state.profile?.social_activity_visible,
      state.profile?.username,
    ]
  );
  const profileDirty =
    normalizedProfileDraft.username !== normalizedPersistedProfile.username ||
    normalizedProfileDraft.display_name !== normalizedPersistedProfile.display_name ||
    normalizedProfileDraft.avatar_url !== normalizedPersistedProfile.avatar_url;
  const plannerPrimaryTabDirty =
    normalizedProfileDraft.planner_primary_tab !==
    normalizedPersistedProfile.planner_primary_tab;
  const socialActivityVisibleDirty =
    normalizedProfileDraft.social_activity_visible !==
    normalizedPersistedProfile.social_activity_visible;
  const plannerPreferencesDirty =
    plannerPreferencesDraft.timezone !== plannerPreferencesPersisted.timezone ||
    normalizeWeekStartsOn(plannerPreferencesDraft.weekStartsOn) !==
      normalizeWeekStartsOn(plannerPreferencesPersisted.weekStartsOn);
  const canSaveProfile = Boolean(state.userId) && profileDirty;
  const canSavePreferences =
    Boolean(state.userId) &&
    !plannerPreferencesLoading &&
    (plannerPrimaryTabDirty || socialActivityVisibleDirty || plannerPreferencesDirty);

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

  const savePreferences = async () => {
    if (!canSavePreferences) {
      return;
    }
    setSaving(true);
    try {
      const profilePreferencesUpdate = buildProfilePreferencesUpdate({
        plannerPrimaryTabDirty,
        socialActivityVisibleDirty,
        plannerPrimaryTab: normalizedProfileDraft.planner_primary_tab,
        socialActivityVisible: normalizedProfileDraft.social_activity_visible,
      });

      if (profilePreferencesUpdate) {
        const { error } = await supabase
          .from("profiles")
          .update(profilePreferencesUpdate)
          .eq("id", state.userId);
        if (error) {
          toast.error(error.message);
          return;
        }
      }

      if (plannerPreferencesDirty) {
        const defaultPolicy: PlannerPolicy = createDefaultPlannerPolicy(
          plannerPreferencesDraft.timezone,
          new Date().toISOString()
        );
        defaultPolicy.weekStartsOn = normalizeWeekStartsOn(
          plannerPreferencesDraft.weekStartsOn
        );
        defaultPolicy.restWeekdays = [...plannerPreferencesPersisted.restWeekdays];
        await putJson("/api/planner/context", {
          timezone: plannerPreferencesDraft.timezone,
          defaultPolicy,
        });
        invalidatePlannerRelatedTabCaches();
      }

      toast.success("Preferences updated.");
      await loadData();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Planner preferences could not be saved.")
      );
    } finally {
      setSaving(false);
    }
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
    plannerPreferencesLoading,
    plannerPreferencesDraft,
    setPlannerPreferencesDraft,
    visibleSearchResults,
    shareableGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    canSaveProfile,
    canSavePreferences,
    saveProfile,
    savePreferences,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    signOut,
  };
}
