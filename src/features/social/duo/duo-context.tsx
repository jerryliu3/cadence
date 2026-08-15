"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { writeDuoScopeCookie } from "@/lib/social/duo/scope-cookie";
import { reportDuoTelemetry } from "@/lib/social/duo/telemetry";
import type {
  DuoAvailability,
  DuoContextState,
  DuoScope,
} from "@cadence/shared/social/duo";
import {
  resolveEffectiveDuoScope,
  shouldClampDuoScopePreference,
} from "@cadence/shared/social/duo";

interface DuoContextValue {
  viewerUserId: string;
  state: DuoContextState;
  availability: DuoAvailability;
  scopePreference: DuoScope | null;
  setScopePreference: (scope: DuoScope | null) => void;
}

const DuoContext = createContext<DuoContextValue>({
  viewerUserId: "",
  state: {
    activePartner: null,
    pendingInvite: null,
  },
  availability: "ready",
  scopePreference: null,
  setScopePreference: () => undefined,
});

export function DuoProvider({
  children,
  viewerUserId,
  initialState,
  availability,
  initialScopePreference,
}: {
  children: ReactNode;
  viewerUserId: string;
  initialState: DuoContextState;
  availability: DuoAvailability;
  initialScopePreference: DuoScope | null;
}) {
  const [scopePreference, setScopePreferenceState] = useState<DuoScope | null>(
    initialScopePreference
  );

  // The cookie write is a side effect of the user's choice, not of rendering.
  // Doing it in an effect also fought the server-rendered initial value: the
  // first pass cleared the cookie before restoring it on the next render.
  const setScopePreference = useCallback((next: DuoScope | null) => {
    setScopePreferenceState(next);
    writeDuoScopeCookie(next);
  }, []);

  // Clamp during render rather than writing state from an effect: useDuoScope
  // already falls back to "me" without a partner, so the state write was
  // redundant and only cost an extra render. Gate on availability so a failed
  // team-state load is never mistaken for "no partner". The effect keeps the
  // two real side effects -- telemetry and clearing the persisted cookie.
  const shouldClampScope = shouldClampDuoScopePreference({
    availability,
    hasActivePartner: initialState.activePartner !== null,
    scopePreference,
  });
  const displayedScopePreference = shouldClampScope ? null : scopePreference;

  useEffect(() => {
    if (!shouldClampScope) {
      return;
    }
    reportDuoTelemetry("post_dissolution_scope_clamp", {
      surface: "shell",
      previousScope: scopePreference,
    });
    writeDuoScopeCookie(null);
  }, [scopePreference, shouldClampScope]);

  const value = useMemo<DuoContextValue>(
    () => ({
      viewerUserId,
      state: initialState,
      availability,
      scopePreference: displayedScopePreference,
      setScopePreference,
    }),
    [
      availability,
      displayedScopePreference,
      initialState,
      setScopePreference,
      viewerUserId,
    ]
  );

  return <DuoContext.Provider value={value}>{children}</DuoContext.Provider>;
}

export function useDuo() {
  return useContext(DuoContext);
}

export function useDuoScope(surfaceDefault: DuoScope) {
  const { state, availability, scopePreference, setScopePreference } = useDuo();
  const effectiveScope = resolveEffectiveDuoScope({
    availability,
    hasActivePartner: state.activePartner !== null,
    scopePreference,
    surfaceDefault,
  });

  return {
    scope: effectiveScope.scope,
    hasActivePartner: effectiveScope.hasActivePartner,
    activePartner: effectiveScope.hasActivePartner ? state.activePartner : null,
    pendingInvite: availability === "ready" ? state.pendingInvite : null,
    scopePreference,
    setScopePreference,
  } as const;
}
