import { useEffect, useState } from "react";
import {
  DEFAULT_MAIN_PAGE_PREFERENCE,
  DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
  normalizeDefaultMainPagePreference,
  normalizePlannerPrimaryTabPreference,
  type DefaultMainPagePreference,
  type PlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import { supabase } from "./supabase";

interface ProfileNavigationPreferencesState {
  defaultMainPagePreference: DefaultMainPagePreference;
  plannerPrimaryTabPreference: PlannerPrimaryTabPreference;
}

const DEFAULT_PREFERENCES: Omit<ProfileNavigationPreferencesState, "loading"> = {
  defaultMainPagePreference: DEFAULT_MAIN_PAGE_PREFERENCE,
  plannerPrimaryTabPreference: DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
};

export function useProfileNavigationPreferences(userId: string | null) {
  const [state, setState] = useState<{
    loadedUserId: string | null;
    preferences: ProfileNavigationPreferencesState;
  }>(() => ({
    loadedUserId: null,
    preferences: {
      ...DEFAULT_PREFERENCES,
    },
  }));

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("default_main_page, planner_primary_tab")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      setState({
        loadedUserId: userId,
        preferences: {
          defaultMainPagePreference: normalizeDefaultMainPagePreference(
            data?.default_main_page
          ),
          plannerPrimaryTabPreference: normalizePlannerPrimaryTabPreference(
            data?.planner_primary_tab
          ),
        },
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) {
    return {
      loading: false,
      ...DEFAULT_PREFERENCES,
    };
  }

  if (state.loadedUserId !== userId) {
    return {
      loading: true,
      ...DEFAULT_PREFERENCES,
    };
  }

  return {
    loading: false,
    ...state.preferences,
  };
}
