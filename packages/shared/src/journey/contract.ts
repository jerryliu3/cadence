export type JourneyBiome =
  | "basecamp"
  | "forest"
  | "ridge"
  | "alpine"
  | "summit";

export type JourneyTimeOfDay = "dawn" | "day" | "dusk" | "night";

export type JourneyWeather = "clear" | "cloudy" | "rain" | "snow";

export interface JourneyProgressState {
  schemaVersion: 1;
  routeId: string;
  seasonId: string | null;
  biome: JourneyBiome;
  checkpointIndex: number;
  checkpointProgress: number;
  showPartner: boolean;
  partnerProgress: number | null;
  environment?: {
    timeOfDay?: JourneyTimeOfDay;
    weather?: JourneyWeather;
  };
}

export type JourneyMotionMode = "full" | "reduced" | "still";
export type JourneyQualityTier = "low" | "standard" | "high";

export interface JourneyRenderPolicy {
  assetVersion: string;
  motionMode: JourneyMotionMode;
  qualityTier: JourneyQualityTier;
  videoEnabled: boolean;
  riveEnabled: boolean;
  lifecyclePaused: boolean;
}

export type JourneyEffectKind = "completion" | "checkpoint" | "summit";

export interface JourneyEffectEvent {
  id: string;
  kind: JourneyEffectKind;
  sourceEventId: string;
  occurredAt: string;
}
