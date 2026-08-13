import { configureLightPressHaptics } from "@cadence/shared/feedback/haptics";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

configureLightPressHaptics(() => {
  let reduced = false;
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    reduced = value;
  });
  if (reduced) {
    return false;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return true;
});

export { triggerLightPressFeedback } from "@cadence/shared/feedback/haptics";
