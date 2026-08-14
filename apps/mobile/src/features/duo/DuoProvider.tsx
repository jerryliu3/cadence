import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DUO_SURFACE_DEFAULTS,
  resolveEffectiveDuoScope,
  type DuoAvailability,
  type DuoContextState,
  type DuoScope,
  type DuoSurfaceName,
} from "@cadence/shared/social/duo";
import type { SocialTeamStateResponse } from "@cadence/shared/social/team";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { api } from "../../lib/api";
import { useForceUpgradeRequired } from "../../lib/runtime-config";
import { useSession } from "../../lib/session";
import { duoQueryKeys } from "./query-keys";
import {
  loadStoredDuoScopePreference,
  saveStoredDuoScopePreference,
  shouldClearStoredScopePreference,
} from "./scope-preference";
import { resolveDuoTeamLoadResult } from "./team-load";
import { reportMobileDuoTelemetry } from "./telemetry";

interface DuoContextValue {
  socialEnabled: boolean;
  availability: DuoAvailability;
  state: DuoContextState;
  scopePreference: DuoScope | null;
  scopePreferenceReady: boolean;
  teamLoading: boolean;
  teamRefreshing: boolean;
  setScopePreference: (scopePreference: DuoScope | null) => Promise<void>;
  resolveSurfaceScope: (
    surface: DuoSurfaceName
  ) => ReturnType<typeof resolveEffectiveDuoScope>;
  refreshTeam: () => Promise<void>;
}

const DuoContext = createContext<DuoContextValue | null>(null);

export function DuoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { flags } = useForceUpgradeRequired();
  const socialEnabled = flags?.socialEnabled ?? false;
  const scopePreferenceQueryKey = useMemo(
    () => ["mobile-duo-scope", userId ?? "anonymous"] as const,
    [userId]
  );

  const scopePreferenceQuery = useQuery({
    queryKey: scopePreferenceQueryKey,
    enabled: Boolean(userId),
    queryFn: () => loadStoredDuoScopePreference({ userId }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const scopePreference = userId ? (scopePreferenceQuery.data ?? null) : null;
  const scopePreferenceReady =
    !userId || scopePreferenceQuery.isSuccess || scopePreferenceQuery.isError;

  const teamQuery = useQuery({
    queryKey: duoQueryKeys.team(userId),
    enabled: socialEnabled && Boolean(userId),
    queryFn: () => api.getJson<SocialTeamStateResponse>("/api/social/team"),
  });
  const {
    data: teamStateResponse,
    isError: teamHasError,
    isLoading: teamLoading,
    isRefetching: teamRefreshing,
    isSuccess: hasSuccessfulTeamState,
    refetch: refetchTeamState,
  } = teamQuery;

  const loadResult = useMemo(
    () =>
      resolveDuoTeamLoadResult({
        socialEnabled,
        teamStateResponse: teamStateResponse ?? null,
        hasError: teamHasError,
      }),
    [socialEnabled, teamHasError, teamStateResponse]
  );
  const hasActivePartner = Boolean(loadResult.state.activePartner);
  const hasConfirmedReadyTeamState = !socialEnabled || hasSuccessfulTeamState;

  useEffect(() => {
    if (!userId || !scopePreferenceReady || !hasConfirmedReadyTeamState) {
      return;
    }
    if (
      !shouldClearStoredScopePreference({
        socialEnabled,
        availability: loadResult.availability,
        hasActivePartner,
        scopePreference,
      })
    ) {
      return;
    }
    reportMobileDuoTelemetry("post_dissolution_scope_clamp", {
      surface: "shell",
      previousScope: scopePreference,
    });
    void saveStoredDuoScopePreference({ userId, scopePreference: null })
      .then(() => {
        queryClient.setQueryData(scopePreferenceQueryKey, null);
      })
      .catch(() => {
        // Ignore storage write failures; the in-memory query cache remains unchanged.
      });
  }, [
    hasActivePartner,
    hasConfirmedReadyTeamState,
    loadResult.availability,
    queryClient,
    scopePreference,
    scopePreferenceQueryKey,
    scopePreferenceReady,
    socialEnabled,
    userId,
  ]);

  const setScopePreference = useCallback(
    async (nextScopePreference: DuoScope | null) => {
      await saveStoredDuoScopePreference({
        userId,
        scopePreference: nextScopePreference,
      });
      queryClient.setQueryData(scopePreferenceQueryKey, nextScopePreference);
    },
    [queryClient, scopePreferenceQueryKey, userId]
  );

  const resolveSurfaceScope = useCallback(
    (surface: DuoSurfaceName) =>
      resolveEffectiveDuoScope({
        availability: loadResult.availability,
        hasActivePartner,
        scopePreference,
        surfaceDefault: DUO_SURFACE_DEFAULTS[surface],
      }),
    [hasActivePartner, loadResult.availability, scopePreference]
  );

  const refreshTeam = useCallback(async () => {
    if (!socialEnabled || !userId) {
      return;
    }
    await refetchTeamState();
  }, [refetchTeamState, socialEnabled, userId]);

  const value = useMemo<DuoContextValue>(
    () => ({
      socialEnabled,
      availability: loadResult.availability,
      state: loadResult.state,
      scopePreference,
      scopePreferenceReady,
      teamLoading: socialEnabled && Boolean(userId) && teamLoading,
      teamRefreshing: socialEnabled && Boolean(userId) && teamRefreshing,
      setScopePreference,
      resolveSurfaceScope,
      refreshTeam,
    }),
    [
      loadResult.availability,
      loadResult.state,
      refreshTeam,
      resolveSurfaceScope,
      scopePreference,
      scopePreferenceReady,
      setScopePreference,
      socialEnabled,
      teamLoading,
      teamRefreshing,
      userId,
    ]
  );

  return <DuoContext.Provider value={value}>{children}</DuoContext.Provider>;
}

export function useDuo() {
  const context = useContext(DuoContext);
  if (!context) {
    throw new Error("useDuo must be used inside DuoProvider.");
  }
  return context;
}

export function useDuoSurfaceScope(surface: DuoSurfaceName) {
  const duo = useDuo();
  const resolved = duo.resolveSurfaceScope(surface);
  return {
    ...resolved,
    scopePreference: duo.scopePreference,
    setScopePreference: duo.setScopePreference,
  };
}
