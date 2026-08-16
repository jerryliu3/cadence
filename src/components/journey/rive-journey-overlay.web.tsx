"use client";

import type { JourneyProgressState, JourneyRenderPolicy } from "@cadence/shared/journey";

interface RiveJourneyOverlayProps {
  progress: JourneyProgressState;
  policy: JourneyRenderPolicy;
}

export function RiveJourneyOverlay({ progress, policy }: RiveJourneyOverlayProps) {
  if (!policy.riveEnabled || policy.lifecyclePaused) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      data-journey-layer="rive-overlay"
      data-biome={progress.biome}
      data-checkpoint={progress.checkpointIndex}
    />
  );
}
