import type { FeatureFlags } from "@cadence/shared/feature-flags";

export type JourneyFeatureFlags = Pick<
  FeatureFlags,
  "journeyEnabled"
>;

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
