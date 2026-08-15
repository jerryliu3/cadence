import { configureLightPressHaptics } from "@cadence/shared/feedback/haptics";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotionEnabled = false;
let reduceMotionSubscribed = false;

export function configureMobileHaptics() {
  if (!reduceMotionSubscribed) {
    reduceMotionSubscribed = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduceMotionEnabled = value;
    });
    AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      reduceMotionEnabled = value;
    });
  }
  configureLightPressHaptics(() => {
    if (reduceMotionEnabled) {
      return false;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  });
}

export { triggerLightPressFeedback } from "@cadence/shared/feedback/haptics";
