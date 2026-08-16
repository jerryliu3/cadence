import type { JourneyBiome } from "./contract";

export interface JourneyRouteCheckpoint {
  biome: JourneyBiome;
  start: number;
  end: number;
}

export interface JourneyRouteDefinition {
  id: string;
  version: number;
  checkpoints: readonly JourneyRouteCheckpoint[];
}

export const firstExpeditionRoute = {
  id: "first-ascent",
  version: 1,
  checkpoints: [
    { biome: "basecamp", start: 0, end: 0.2 },
    { biome: "forest", start: 0.2, end: 0.45 },
    { biome: "ridge", start: 0.45, end: 0.7 },
    { biome: "alpine", start: 0.7, end: 0.95 },
    { biome: "summit", start: 0.95, end: 1 },
  ],
} as const satisfies JourneyRouteDefinition;

const routeRegistry: Record<string, JourneyRouteDefinition> = {
  [firstExpeditionRoute.id]: firstExpeditionRoute,
};

export interface JourneyCheckpointProgress {
  biome: JourneyBiome;
  checkpointIndex: number;
  checkpointProgress: number;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function getJourneyRoute(routeId?: string | null): JourneyRouteDefinition {
  if (!routeId) {
    return firstExpeditionRoute;
  }
  return routeRegistry[routeId] ?? firstExpeditionRoute;
}

export function resolveCheckpointProgress(
  route: JourneyRouteDefinition,
  progressValue: number
): JourneyCheckpointProgress {
  const progress = clampProgress(progressValue);
  const checkpoints = route.checkpoints;
  const fallback = checkpoints[checkpoints.length - 1] ?? {
    biome: "summit",
    start: 0,
    end: 1,
  };

  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    const isLast = index === checkpoints.length - 1;
    const withinRange = isLast
      ? progress >= checkpoint.start && progress <= checkpoint.end
      : progress >= checkpoint.start && progress < checkpoint.end;
    if (!withinRange) {
      continue;
    }
    const span = checkpoint.end - checkpoint.start;
    const localProgress =
      span <= 0 ? 1 : (progress - checkpoint.start) / Math.max(span, Number.EPSILON);
    return {
      biome: checkpoint.biome,
      checkpointIndex: index,
      checkpointProgress: clampProgress(localProgress),
    };
  }

  const fallbackIndex = Math.max(0, checkpoints.length - 1);
  return {
    biome: fallback.biome,
    checkpointIndex: fallbackIndex,
    checkpointProgress: 1,
  };
}

export function normalizeProgressFromXp({
  routeProgress,
  seasonalXp,
  seasonalTargetXp,
  lifetimeXp,
}: {
  routeProgress?: number | null;
  seasonalXp?: number | null;
  seasonalTargetXp?: number | null;
  lifetimeXp?: number | null;
}) {
  if (routeProgress !== undefined && routeProgress !== null) {
    return clampProgress(routeProgress);
  }

  if (
    seasonalXp !== undefined &&
    seasonalXp !== null &&
    seasonalTargetXp !== undefined &&
    seasonalTargetXp !== null &&
    seasonalTargetXp > 0
  ) {
    return clampProgress(seasonalXp / seasonalTargetXp);
  }

  // Fallback for early rollout where seasonal targeting is unavailable.
  const safeLifetimeXp = Math.max(0, lifetimeXp ?? 0);
  const softCap = 8_000;
  return clampProgress(safeLifetimeXp / softCap);
}
