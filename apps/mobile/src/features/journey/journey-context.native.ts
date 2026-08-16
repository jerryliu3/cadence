import { createContext, useContext } from "react";
import {
  defaultJourneyAssetManifest,
  resolveJourneySceneAsset,
  type JourneyProgressState,
} from "@cadence/shared/journey";
import {
  defaultJourneyPresentation,
  type JourneyContextValue,
} from "./types";

const defaultProgressState: JourneyProgressState = {
  schemaVersion: 1,
  routeId: "first-ascent",
  seasonId: null,
  biome: "basecamp",
  checkpointIndex: 0,
  checkpointProgress: 0,
  showPartner: false,
  partnerProgress: null,
};

export const JourneyContext = createContext<JourneyContextValue>({
  progressState: defaultProgressState,
  renderPolicy: {
    assetVersion: "v1",
    motionMode: "still",
    qualityTier: "standard",
    videoEnabled: false,
    riveEnabled: false,
    lifecyclePaused: true,
  },
  scene: resolveJourneySceneAsset({
    manifest: defaultJourneyAssetManifest,
    biome: "basecamp",
  }),
  presentation: defaultJourneyPresentation,
  setPresentation: () => undefined,
  resetPresentation: () => undefined,
});

export function useJourney() {
  return useContext(JourneyContext);
}
