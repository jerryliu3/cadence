"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  consumeJourneyEffectEvent,
  createJourneyEffectEvent,
  deriveJourneyProgressState,
  resolveJourneyRenderPolicy,
  resolveJourneySceneAsset,
  type JourneyEffectEvent,
  type JourneyRenderPolicy,
} from "@cadence/shared/journey";
import { useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useXpProfile } from "@/components/xp/xp-profile-provider";
import { JourneyContrastLayer } from "./journey-contrast-layer";
import { RiveJourneyOverlay } from "./rive-journey-overlay.web";
import { StaticJourneyPoster } from "./static-journey-poster.web";
import type { JourneyFeatureFlags } from "./types";
import { useJourneyManifest } from "./use-journey-manifest.web";
import { WebJourneyVideo } from "./web-journey-video";

function isAuthRoute(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname === "/reset-password";
}

function allowJourneyVideoForPathname(pathname: string) {
  if (pathname.startsWith("/social")) {
    return true;
  }
  if (isAuthRoute(pathname)) {
    return true;
  }
  return false;
}

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
  assetVersion,
  flags,
  reducedMotion,
  lifecyclePaused,
  videoEnabled,
}: {
  assetVersion: string;
  flags: JourneyFeatureFlags;
  reducedMotion: boolean;
  lifecyclePaused: boolean;
  videoEnabled: boolean;
}): JourneyRenderPolicy {
  return resolveJourneyRenderPolicy({
    assetVersion,
    journeyEnabled: flags.journeyEnabled,
    videoEnabled,
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
  const pathname = usePathname() ?? "";
  const videoEnabledForRoute = allowJourneyVideoForPathname(pathname);
  const reducedMotion = Boolean(useReducedMotion());
  const hidden = useDocumentVisibility();
  const { profile } = useXpProfile();
  const [readySourceUrl, setReadySourceUrl] = useState<string | null>(null);
  const [failedSourceUrl, setFailedSourceUrl] = useState<string | null>(null);
  const [latestEffectEvent, setLatestEffectEvent] =
    useState<JourneyEffectEvent | null>(null);
  const consumedEffectIdsRef = useRef(new Set<string>());
  const previousCheckpointRef = useRef<number | null>(null);
  const { assetVersion, manifest, source: manifestSource } = useJourneyManifest();

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
        assetVersion,
        flags,
        reducedMotion,
        lifecyclePaused: hidden,
        videoEnabled: videoEnabledForRoute,
      }),
    [assetVersion, flags, hidden, reducedMotion, videoEnabledForRoute]
  );

  const activeScene = useMemo(
    () =>
      resolveJourneySceneAsset({
        manifest,
        biome: progressState.biome,
      }),
    [manifest, progressState.biome]
  );

  const sceneVideoUrls = useMemo(
    () =>
      [
        activeScene.video.desktop[0]?.url ?? null,
        activeScene.video.mobile[0]?.url ?? null,
      ].filter((url): url is string => Boolean(url)),
    [activeScene.video.desktop, activeScene.video.mobile]
  );

  const sceneSourceFailed =
    failedSourceUrl !== null && sceneVideoUrls.includes(failedSourceUrl);
  const sceneSourceReady =
    readySourceUrl !== null && sceneVideoUrls.includes(readySourceUrl);

  const showVideo =
    renderPolicy.videoEnabled && !renderPolicy.lifecyclePaused && !sceneSourceFailed;
  const showPoster = !showVideo || !sceneSourceReady;
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
        onReady={(sourceUrl) => setReadySourceUrl(sourceUrl)}
        onError={(sourceUrl) => setFailedSourceUrl(sourceUrl)}
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
