import type { JourneyProgressState } from "./contract";
import {
  firstExpeditionRoute,
  getJourneyRoute,
  normalizeProgressFromXp,
  resolveCheckpointProgress,
} from "./progression-curves";

export interface DeriveJourneyProgressInput {
  routeId?: string | null;
  seasonId?: string | null;
  routeProgress?: number | null;
  seasonalXp?: number | null;
  seasonalTargetXp?: number | null;
  lifetimeXp?: number | null;
  partner?: {
    visible: boolean;
    progress: number | null;
  };
  environment?: JourneyProgressState["environment"];
}

function clampProgress(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, value));
}

export function deriveJourneyProgressState(
  input: DeriveJourneyProgressInput
): JourneyProgressState {
  const route = getJourneyRoute(input.routeId);
  const routeProgress = normalizeProgressFromXp({
    routeProgress: input.routeProgress,
    seasonalXp: input.seasonalXp,
    seasonalTargetXp: input.seasonalTargetXp,
    lifetimeXp: input.lifetimeXp,
  });
  const checkpoint = resolveCheckpointProgress(route, routeProgress);
  const normalizedPartnerProgress = clampProgress(input.partner?.progress);

  return {
    schemaVersion: 1,
    routeId: route.id ?? firstExpeditionRoute.id,
    seasonId: input.seasonId ?? null,
    biome: checkpoint.biome,
    checkpointIndex: checkpoint.checkpointIndex,
    checkpointProgress: checkpoint.checkpointProgress,
    showPartner: Boolean(input.partner?.visible),
    partnerProgress: input.partner?.visible ? normalizedPartnerProgress : null,
    environment: input.environment,
  };
}
