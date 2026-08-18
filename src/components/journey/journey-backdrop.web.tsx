"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  consumeJourneyEffectEvent,
  createJourneyEffectEvent,
  defaultJourneyAssetManifest,
  deriveJourneyProgressState,
  resolveJourneyRenderPolicy,
  resolveJourneySceneAsset,
  type JourneyEffectEvent,
  type JourneyRenderPolicy,
} from "@cadence/shared/journey";
import { useReducedMotion } from "motion/react";
import { useXpProfile } from "@/components/xp/xp-profile-provider";
import { JourneyContrastLayer } from "./journey-contrast-layer";
import { RiveJourneyOverlay } from "./rive-journey-overlay.web";
import { StaticJourneyPoster } from "./static-journey-poster.web";
import type { JourneyFeatureFlags } from "./types";
import { WebJourneyVideo } from "./web-journey-video";

const JOURNEY_ASSET_VERSION = defaultJourneyAssetManifest.assetVersion;

function useDocumentVisibility() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => {
      setHidden(document.hidden);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return hidden;
}

function createRenderPolicy({
  flags,
  reducedMotion,
  lifecyclePaused,
}: {
  flags: JourneyFeatureFlags;
  reducedMotion: boolean;
  lifecyclePaused: boolean;
}): JourneyRenderPolicy {
  return resolveJourneyRenderPolicy({
    assetVersion: JOURNEY_ASSET_VERSION,
    journeyEnabled: flags.journeyEnabled,
    videoEnabled: true,
    riveEnabled: false,
    reducedMotionPreferred: reducedMotion,
    lowPowerMode: false,
    lifecyclePaused,
  });
}

export interface JourneyBackdropProps {
  flags: JourneyFeatureFlags;
}

export function JourneyBackdrop({ flags }: JourneyBackdropProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const hidden = useDocumentVisibility();
  const { profile } = useXpProfile();
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [latestEffectEvent, setLatestEffectEvent] =
    useState<JourneyEffectEvent | null>(null);
  const consumedEffectIdsRef = useRef(new Set<string>());
  const previousCheckpointRef = useRef<number | null>(null);
  const manifest = defaultJourneyAssetManifest;
  const manifestSource = "bundled";

  const progressState = useMemo(
    () =>
      deriveJourneyProgressState({
        routeId: "first-ascent",
        seasonId: null,
        lifetimeXp: profile?.totalXp ?? 0,
      }),
    [profile?.totalXp]
  );

  const renderPolicy = useMemo(
    () =>
      createRenderPolicy({
        flags,
        reducedMotion,
        lifecyclePaused: hidden,
      }),
    [flags, hidden, reducedMotion]
  );

  const activeScene = useMemo(
    () =>
      resolveJourneySceneAsset({
        manifest,
        biome: progressState.biome,
      }),
    [manifest, progressState.biome]
  );

  const showVideo = renderPolicy.videoEnabled && !renderPolicy.lifecyclePaused && !videoFailed;
  const showPoster = !showVideo || !videoReady;
  const contrastOpacity =
    renderPolicy.motionMode === "still" ? Math.min(0.65, activeScene.scrim.opacity + 0.12) : activeScene.scrim.opacity;

  useEffect(() => {
    const previousCheckpoint = previousCheckpointRef.current;
    previousCheckpointRef.current = progressState.checkpointIndex;

    // Initial hydration should not emit celebratory one-shot events.
    if (previousCheckpoint === null || !profile) {
      return;
    }

    if (progressState.checkpointIndex <= previousCheckpoint) {
      return;
    }

    const kind =
      progressState.biome === "summit" ? "summit" : "checkpoint";
    const event = createJourneyEffectEvent({
      kind,
      sourceEventId: `xp-${profile.totalXp}-cp-${progressState.checkpointIndex}`,
    });
    if (!consumeJourneyEffectEvent(consumedEffectIdsRef.current, event)) {
      return;
    }
    setLatestEffectEvent(event);
  }, [profile, progressState.biome, progressState.checkpointIndex]);

  return (
    <>
      <StaticJourneyPoster
        mobileSrc={activeScene.poster.mobile.url}
        desktopSrc={activeScene.poster.desktop.url}
        visible={showPoster}
      />
      <WebJourneyVideo
        desktopSources={activeScene.video.desktop}
        mobileSources={activeScene.video.mobile}
        enabled={showVideo}
        paused={renderPolicy.lifecyclePaused}
        onReady={() => setVideoReady(true)}
        onError={() => setVideoFailed(true)}
      />
      <JourneyContrastLayer
        opacity={contrastOpacity}
        position={activeScene.scrim.position}
      />
      <RiveJourneyOverlay
        progress={progressState}
        policy={renderPolicy}
        latestEffectEvent={latestEffectEvent}
      />
      <div
        aria-hidden="true"
        data-journey-manifest-source={manifestSource}
        data-journey-asset-version={renderPolicy.assetVersion}
      />
    </>
  );
}
