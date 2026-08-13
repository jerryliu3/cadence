"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { writeDuoScopeCookie } from "@/lib/social/duo/scope-cookie";
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

  const value = useMemo<DuoContextValue>(
    () => ({
      state: initialState,
      scopePreference,
      setScopePreference,
    }),
    [initialState, scopePreference, setScopePreference]
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
