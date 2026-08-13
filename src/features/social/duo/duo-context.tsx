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
import type { DuoContextState, DuoScope } from "@/lib/social/duo/types";

interface DuoContextValue {
  state: DuoContextState;
  scopePreference: DuoScope | null;
  setScopePreference: (scope: DuoScope | null) => void;
}

const DuoContext = createContext<DuoContextValue>({
  state: {
    activePartner: null,
    pendingInvite: null,
  },
  scopePreference: null,
  setScopePreference: () => undefined,
});

export function DuoProvider({
  children,
  initialState,
  initialScopePreference,
}: {
  children: ReactNode;
  initialState: DuoContextState;
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
  // redundant and only cost an extra render. The effect keeps the two real
  // side effects -- telemetry and clearing the persisted cookie.
  const shouldClampScope =
    initialState.activePartner === null &&
    scopePreference !== null &&
    scopePreference !== "me";
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
      state: initialState,
      scopePreference: displayedScopePreference,
      setScopePreference,
    }),
    [displayedScopePreference, initialState, setScopePreference]
  );

  return <DuoContext.Provider value={value}>{children}</DuoContext.Provider>;
}

export function useDuo() {
  return useContext(DuoContext);
}

export function useDuoScope(surfaceDefault: DuoScope) {
  const { state, scopePreference, setScopePreference } = useDuo();
  const hasActivePartner = state.activePartner !== null;
  const scope = hasActivePartner ? (scopePreference ?? surfaceDefault) : "me";

  return {
    scope,
    hasActivePartner,
    activePartner: state.activePartner,
    pendingInvite: state.pendingInvite,
    scopePreference,
    setScopePreference,
  } as const;
}
