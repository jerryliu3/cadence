import type {
  JourneyProgressState,
  JourneyRenderPolicy,
  JourneySceneAsset,
} from "@cadence/shared/journey";

export interface JourneyPresentationPreferences {
  visible: boolean;
  contrast: "default" | "strong";
  preferredComposition: "default" | "planner";
}

export const defaultJourneyPresentation: JourneyPresentationPreferences = {
  visible: true,
  contrast: "default",
  preferredComposition: "default",
};

export interface JourneyContextValue {
  progressState: JourneyProgressState;
  renderPolicy: JourneyRenderPolicy;
  scene: JourneySceneAsset;
  presentation: JourneyPresentationPreferences;
  setPresentation: (next: Partial<JourneyPresentationPreferences>) => void;
  resetPresentation: () => void;
}
