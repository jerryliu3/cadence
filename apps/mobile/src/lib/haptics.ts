import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotionEnabled = false;
let reduceMotionSubscribed = false;

function subscribeReduceMotion() {
  if (reduceMotionSubscribed) {
    return;
  }
  reduceMotionSubscribed = true;
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    reduceMotionEnabled = value;
  });
  AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
    reduceMotionEnabled = value;
  });
}

subscribeReduceMotion();

export function triggerLightPressFeedback(): boolean {
  if (reduceMotionEnabled) {
    return false;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return true;
}
