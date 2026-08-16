import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useJourneyLifecyclePause() {
  const [paused, setPaused] = useState(AppState.currentState !== "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setPaused(nextState !== "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return paused;
}
