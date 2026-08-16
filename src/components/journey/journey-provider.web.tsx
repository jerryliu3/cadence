"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  defaultJourneyPresentation,
  type JourneyFeatureFlags,
  type JourneyPresentationPreferences,
} from "./types";

interface JourneyPresentationContextValue {
  presentation: JourneyPresentationPreferences;
  setPresentation: (next: Partial<JourneyPresentationPreferences>) => void;
  resetPresentation: () => void;
}

const JourneyPresentationContext = createContext<JourneyPresentationContextValue>({
  presentation: defaultJourneyPresentation,
  setPresentation: () => undefined,
  resetPresentation: () => undefined,
});

export interface JourneyProviderProps {
  children: ReactNode;
  flags: JourneyFeatureFlags;
}

export function JourneyProvider({ children, flags }: JourneyProviderProps) {
  const [presentation, setPresentationState] = useState<JourneyPresentationPreferences>(
    defaultJourneyPresentation
  );

  const value = useMemo<JourneyPresentationContextValue>(
    () => ({
      presentation,
      setPresentation(next) {
        setPresentationState((current) => ({ ...current, ...next }));
      },
      resetPresentation() {
        setPresentationState(defaultJourneyPresentation);
      },
    }),
    [presentation]
  );

  if (!flags.journeyEnabled) {
    return <>{children}</>;
  }

  return (
    <JourneyPresentationContext.Provider value={value}>
      {children}
    </JourneyPresentationContext.Provider>
  );
}

export function useJourneyPresentation() {
  return useContext(JourneyPresentationContext);
}
