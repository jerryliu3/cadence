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
  loading: boolean;
  defaultMainPagePreference: DefaultMainPagePreference;
  plannerPrimaryTabPreference: PlannerPrimaryTabPreference;
}

const DEFAULT_PREFERENCES: Omit<ProfileNavigationPreferencesState, "loading"> = {
  defaultMainPagePreference: DEFAULT_MAIN_PAGE_PREFERENCE,
  plannerPrimaryTabPreference: DEFAULT_PLANNER_PRIMARY_TAB_PREFERENCE,
};

export function useProfileNavigationPreferences(userId: string | null) {
  const [state, setState] = useState<ProfileNavigationPreferencesState>(() => ({
    loading: Boolean(userId),
    ...DEFAULT_PREFERENCES,
  }));

  useEffect(() => {
    if (!userId) {
      setState({
        loading: false,
        ...DEFAULT_PREFERENCES,
      });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));

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
        loading: false,
        defaultMainPagePreference: normalizeDefaultMainPagePreference(
          data?.default_main_page
        ),
        plannerPrimaryTabPreference: normalizePlannerPrimaryTabPreference(
          data?.planner_primary_tab
        ),
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
