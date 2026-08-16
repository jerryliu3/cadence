import type {
  JourneyMotionMode,
  JourneyQualityTier,
  JourneyRenderPolicy,
} from "./contract";

export type JourneyMotionPreference = "system" | JourneyMotionMode;

export interface ResolveJourneyRenderPolicyInput {
  assetVersion: string;
  journeyEnabled: boolean;
  videoEnabled: boolean;
  riveEnabled: boolean;
  reducedMotionPreferred: boolean;
  lowPowerMode: boolean;
  lifecyclePaused: boolean;
  userMotionPreference?: JourneyMotionPreference;
  requestedQualityTier?: JourneyQualityTier;
}

function resolveMotionMode({
  userMotionPreference,
  reducedMotionPreferred,
  lowPowerMode,
}: {
  userMotionPreference: JourneyMotionPreference;
  reducedMotionPreferred: boolean;
  lowPowerMode: boolean;
}): JourneyMotionMode {
  if (userMotionPreference === "full") {
    return lowPowerMode ? "reduced" : "full";
  }
  if (userMotionPreference === "reduced") {
    return "reduced";
  }
  if (userMotionPreference === "still") {
    return "still";
  }
  if (reducedMotionPreferred) {
    return "reduced";
  }
  if (lowPowerMode) {
    return "reduced";
  }
  return "full";
}

export function resolveJourneyRenderPolicy(
  input: ResolveJourneyRenderPolicyInput
): JourneyRenderPolicy {
  const userMotionPreference = input.userMotionPreference ?? "system";
  const qualityTier = input.requestedQualityTier ?? "standard";

  if (!input.journeyEnabled) {
    return {
      assetVersion: input.assetVersion,
      motionMode: "still",
      qualityTier,
      videoEnabled: false,
      riveEnabled: false,
      lifecyclePaused: true,
    };
  }

  const motionMode = resolveMotionMode({
    userMotionPreference,
    reducedMotionPreferred: input.reducedMotionPreferred,
    lowPowerMode: input.lowPowerMode,
  });

  const videoEnabled = input.videoEnabled && motionMode !== "still";
  const riveEnabled = input.riveEnabled && motionMode !== "still";

  return {
    assetVersion: input.assetVersion,
    motionMode,
    qualityTier,
    videoEnabled,
    riveEnabled,
    lifecyclePaused: input.lifecyclePaused,
  };
}
