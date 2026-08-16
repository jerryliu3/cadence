"use client";

import { useEffect } from "react";
import type { JourneyPresentationPreferences } from "./types";
import { useJourneyPresentation } from "./journey-provider.web";

export function useJourneyPresentationPreference(
  preference: Partial<JourneyPresentationPreferences> | null
) {
  const { setPresentation, resetPresentation } = useJourneyPresentation();

  useEffect(() => {
    if (!preference) {
      return;
    }
    setPresentation(preference);
    return () => {
      resetPresentation();
    };
  }, [preference, resetPresentation, setPresentation]);
}
