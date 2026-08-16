import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Battery from "expo-battery";
import type { JourneyMotionMode } from "@cadence/shared/journey";

const STORAGE_KEY = "journey.motion.mode.v1";

export type JourneyMotionPreference = "system" | JourneyMotionMode;

export function useJourneyMotionMode() {
  const [preference, setPreferenceState] =
    useState<JourneyMotionPreference>("system");
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!mounted) {
        return;
      }
      if (stored === "full" || stored === "reduced" || stored === "still") {
        setPreferenceState(stored);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotionEnabled(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduceMotionEnabled(enabled);
      }
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void Battery.isLowPowerModeEnabledAsync().then((enabled) => {
      if (mounted) {
        setLowPowerMode(enabled);
      }
    });
    const subscription = Battery.addLowPowerModeListener(({ lowPowerMode: next }) => {
      setLowPowerMode(next);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const setPreference = useCallback((next: JourneyMotionPreference) => {
    setPreferenceState(next);
    if (next === "system") {
      void AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  return {
    preference,
    setPreference,
    reduceMotionEnabled,
    lowPowerMode,
  };
}
