import { useEffect } from "react";
import type { JourneyPresentationPreferences } from "./types";
import { useJourney } from "./journey-context.native";

export function useJourneyPresentationPreference(
  preference: Partial<JourneyPresentationPreferences> | null
) {
  const { setPresentation, resetPresentation } = useJourney();

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
