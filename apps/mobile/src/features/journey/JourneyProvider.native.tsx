import {
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  defaultJourneyAssetManifest,
  deriveJourneyProgressState,
  resolveJourneyRenderPolicy,
  resolveJourneySceneAsset,
} from "@cadence/shared/journey";
import { api } from "../../lib/api";
import { useMobileRuntimeConfig } from "../../lib/runtime-config";
import { JourneyContext, useJourney } from "./journey-context.native";
import { useJourneyLifecyclePause } from "./use-journey-lifecycle-pause";
import { useJourneyMotionMode } from "./use-journey-motion-mode";
import {
  defaultJourneyPresentation,
  type JourneyContextValue,
  type JourneyPresentationPreferences,
} from "./types";

interface XpProfileResponse {
  profile: {
    totalXp: number;
  };
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const runtime = useMobileRuntimeConfig();
  const lifecyclePaused = useJourneyLifecyclePause();
  const motion = useJourneyMotionMode();
  const [presentation, setPresentationState] = useState<JourneyPresentationPreferences>(
    defaultJourneyPresentation
  );

  const flags = runtime.data?.flags;
  const journeyEnabled = Boolean(flags?.journeyEnabled);
  const journeyVideoEnabled = Boolean(flags?.journeyVideoEnabled);
  const journeyRiveEnabled = Boolean(flags?.journeyRiveEnabled);
  const assetVersion = flags?.journeyAssetManifestVersion ?? "v1";

  const xpProfile = useQuery({
    queryKey: ["journey", "xp-profile"],
    queryFn: () => api.getJson<XpProfileResponse>("/api/xp/profile"),
    enabled: journeyEnabled && Boolean(flags?.xpEnabled),
    staleTime: 60_000,
    retry: false,
  });

  const progressState = useMemo(
    () =>
      deriveJourneyProgressState({
        routeId: "first-ascent",
        seasonId: null,
        lifetimeXp: xpProfile.data?.profile.totalXp ?? 0,
      }),
    [xpProfile.data?.profile.totalXp]
  );

  const renderPolicy = useMemo(
    () =>
      resolveJourneyRenderPolicy({
        assetVersion,
        journeyEnabled,
        videoEnabled: journeyVideoEnabled,
        riveEnabled: journeyRiveEnabled,
        reducedMotionPreferred: motion.reduceMotionEnabled,
        lowPowerMode: motion.lowPowerMode,
        lifecyclePaused,
        userMotionPreference: motion.preference,
      }),
    [
      assetVersion,
      journeyEnabled,
      journeyRiveEnabled,
      journeyVideoEnabled,
      lifecyclePaused,
      motion.lowPowerMode,
      motion.preference,
      motion.reduceMotionEnabled,
    ]
  );

  const scene = useMemo(
    () =>
      resolveJourneySceneAsset({
        manifest: defaultJourneyAssetManifest,
        biome: progressState.biome,
      }),
    [progressState.biome]
  );

  const value = useMemo<JourneyContextValue>(
    () => ({
      progressState,
      renderPolicy,
      scene,
      presentation,
      setPresentation(next) {
        setPresentationState((current) => ({ ...current, ...next }));
      },
      resetPresentation() {
        setPresentationState(defaultJourneyPresentation);
      },
    }),
    [presentation, progressState, renderPolicy, scene]
  );

  return (
    <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
  );
}
export { useJourney };
