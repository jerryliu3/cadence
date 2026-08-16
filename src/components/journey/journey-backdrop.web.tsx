"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultJourneyAssetManifest,
  deriveJourneyProgressState,
  resolveJourneyRenderPolicy,
  resolveJourneySceneAsset,
  type JourneyRenderPolicy,
} from "@cadence/shared/journey";
import { useReducedMotion } from "motion/react";
import { useXpProfile } from "@/components/xp/xp-profile-provider";
import { JourneyContrastLayer } from "./journey-contrast-layer";
import { RiveJourneyOverlay } from "./rive-journey-overlay.web";
import { StaticJourneyPoster } from "./static-journey-poster.web";
import type { JourneyFeatureFlags } from "./types";
import { WebJourneyVideo } from "./web-journey-video";

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
    assetVersion: flags.journeyAssetManifestVersion,
    journeyEnabled: flags.journeyEnabled,
    videoEnabled: flags.journeyVideoEnabled,
    riveEnabled: flags.journeyRiveEnabled,
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
        manifest: defaultJourneyAssetManifest,
        biome: progressState.biome,
      }),
    [progressState.biome]
  );

  const showVideo = renderPolicy.videoEnabled && !renderPolicy.lifecyclePaused && !videoFailed;
  const showPoster = !showVideo || !videoReady;
  const contrastOpacity =
    renderPolicy.motionMode === "still" ? Math.min(0.65, activeScene.scrim.opacity + 0.12) : activeScene.scrim.opacity;

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
      <RiveJourneyOverlay progress={progressState} policy={renderPolicy} />
    </>
  );
}
