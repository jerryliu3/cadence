import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createJourneyEffectEvent,
  consumeJourneyEffectEvent,
  deriveJourneyProgressState,
  resolveJourneyRenderPolicy,
  resolveJourneySceneAsset,
  type JourneyEffectEvent,
} from "@cadence/shared/journey";
import { api } from "../../lib/api";
import { useMobileRuntimeConfig } from "../../lib/runtime-config";
import { JourneyContext, useJourney } from "./journey-context.native";
import { useJourneyManifest } from "./use-journey-manifest.native";
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
  const { assetVersion, manifest, source: manifestSource } = useJourneyManifest();
  const [latestEffectEvent, setLatestEffectEvent] =
    useState<JourneyEffectEvent | null>(null);
  const consumedEffectIdsRef = useRef(new Set<string>());
  const previousCheckpointRef = useRef<number | null>(null);

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
        videoEnabled: true,
        riveEnabled: false,
        reducedMotionPreferred: motion.reduceMotionEnabled,
        lowPowerMode: motion.lowPowerMode,
        lifecyclePaused,
        userMotionPreference: motion.preference,
      }),
    [
      assetVersion,
      journeyEnabled,
      lifecyclePaused,
      motion.lowPowerMode,
      motion.preference,
      motion.reduceMotionEnabled,
    ]
  );

  const scene = useMemo(
    () =>
      resolveJourneySceneAsset({
        manifest,
        biome: progressState.biome,
      }),
    [manifest, progressState.biome]
  );

  useEffect(() => {
    const previousCheckpoint = previousCheckpointRef.current;
    previousCheckpointRef.current = progressState.checkpointIndex;

    if (previousCheckpoint === null) {
      return;
    }

    if (progressState.checkpointIndex <= previousCheckpoint) {
      return;
    }

    const kind =
      progressState.biome === "summit" ? "summit" : "checkpoint";
    const event = createJourneyEffectEvent({
      kind,
      sourceEventId: `xp-${xpProfile.data?.profile.totalXp ?? 0}-cp-${progressState.checkpointIndex}`,
    });
    if (!consumeJourneyEffectEvent(consumedEffectIdsRef.current, event)) {
      return;
    }
    setLatestEffectEvent(event);
  }, [
    progressState.biome,
    progressState.checkpointIndex,
    xpProfile.data?.profile.totalXp,
  ]);

  const value = useMemo<JourneyContextValue>(
    () => ({
      progressState,
      renderPolicy,
      scene,
      latestEffectEvent,
      manifestSource,
      presentation,
      setPresentation(next) {
        setPresentationState((current) => ({ ...current, ...next }));
      },
      resetPresentation() {
        setPresentationState(defaultJourneyPresentation);
      },
    }),
    [
      latestEffectEvent,
      manifestSource,
      presentation,
      progressState,
      renderPolicy,
      scene,
    ]
  );

  return (
    <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
  );
}
export { useJourney };
