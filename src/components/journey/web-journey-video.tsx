"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetSource } from "@cadence/shared/journey/asset-manifest";

interface WebJourneyVideoProps {
  desktopSources: AssetSource[];
  mobileSources: AssetSource[];
  enabled: boolean;
  paused: boolean;
  onReady: (sourceUrl: string) => void;
  onError: (sourceUrl: string) => void;
}

function pickPrimarySource(
  desktopSources: AssetSource[],
  mobileSources: AssetSource[],
  isMobile: boolean
) {
  const preferred = isMobile ? mobileSources : desktopSources;
  return preferred[0] ?? desktopSources[0] ?? mobileSources[0] ?? null;
}

export function WebJourneyVideo({
  desktopSources,
  mobileSources,
  enabled,
  paused,
  onReady,
  onError,
}: WebJourneyVideoProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(max-width: 767px)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobileViewport(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  const selectedSource = useMemo(
    () => pickPrimarySource(desktopSources, mobileSources, isMobileViewport),
    [desktopSources, isMobileViewport, mobileSources]
  );

  if (!enabled || !selectedSource) {
    return null;
  }

  return (
    <video
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onCanPlay={() => onReady(selectedSource.url)}
      onError={() => onError(selectedSource.url)}
      data-journey-layer="video"
      src={selectedSource.url}
      style={{ visibility: paused ? "hidden" : "visible" }}
    />
  );
}
