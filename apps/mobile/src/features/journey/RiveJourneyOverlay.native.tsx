import { StyleSheet, View } from "react-native";
import type {
  JourneyEffectEvent,
  JourneyProgressState,
  JourneyRenderPolicy,
} from "@cadence/shared/journey";

interface RiveJourneyOverlayProps {
  progress: JourneyProgressState;
  policy: JourneyRenderPolicy;
  latestEffectEvent: JourneyEffectEvent | null;
}

export function RiveJourneyOverlay({
  progress,
  policy,
  latestEffectEvent,
}: RiveJourneyOverlayProps) {
  if (!policy.riveEnabled || policy.lifecyclePaused) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID={`journey-overlay-${progress.biome}-${latestEffectEvent?.kind ?? "none"}`}
    />
  );
}
