"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  readDuoScopeCookieFromDocument,
  writeDuoScopeCookie,
} from "@/lib/social/duo/scope-cookie";
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
  const [scopePreference, setScopePreference] = useState<DuoScope | null>(
    initialScopePreference
  );

  useEffect(() => {
    if (initialScopePreference !== null) {
      return;
    }
    const cookiePreference = readDuoScopeCookieFromDocument();
    if (cookiePreference) {
      setScopePreference(cookiePreference);
    }
  }, [initialScopePreference]);

  useEffect(() => {
    writeDuoScopeCookie(scopePreference);
  }, [scopePreference]);

  const value = useMemo<DuoContextValue>(
    () => ({
      state: initialState,
      scopePreference,
      setScopePreference,
    }),
    [initialState, scopePreference]
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
