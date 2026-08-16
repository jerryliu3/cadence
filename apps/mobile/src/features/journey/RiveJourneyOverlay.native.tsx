import { StyleSheet, View } from "react-native";
import type { JourneyProgressState, JourneyRenderPolicy } from "@cadence/shared/journey";

interface RiveJourneyOverlayProps {
  progress: JourneyProgressState;
  policy: JourneyRenderPolicy;
}

export function RiveJourneyOverlay({ progress, policy }: RiveJourneyOverlayProps) {
  if (!policy.riveEnabled || policy.lifecyclePaused) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID={`journey-overlay-${progress.biome}`}
    />
  );
}
