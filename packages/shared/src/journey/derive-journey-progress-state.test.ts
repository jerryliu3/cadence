import { describe, expect, it } from "vitest";
import { parseJourneyAssetManifest, defaultJourneyAssetManifest } from "./asset-manifest";
import { consumeJourneyEffectEvent, createJourneyEffectEvent } from "./effect-events";
import { deriveJourneyProgressState } from "./derive-journey-progress-state";
import { firstExpeditionRoute, resolveCheckpointProgress } from "./progression-curves";
import { resolveJourneyRenderPolicy } from "./resolve-journey-render-policy";

describe("journey progression", () => {
  it("maps route progress across configured checkpoints", () => {
    const low = resolveCheckpointProgress(firstExpeditionRoute, 0.1);
    const mid = resolveCheckpointProgress(firstExpeditionRoute, 0.5);
    const high = resolveCheckpointProgress(firstExpeditionRoute, 0.98);

    expect(low).toMatchObject({
      biome: "basecamp",
      checkpointIndex: 0,
    });
    expect(mid).toMatchObject({
      biome: "ridge",
      checkpointIndex: 2,
    });
    expect(high).toMatchObject({
      biome: "summit",
      checkpointIndex: 4,
    });
  });

  it("derives deterministic canonical progress state", () => {
    const state = deriveJourneyProgressState({
      routeId: "first-ascent",
      seasonId: "season-1",
      routeProgress: 0.44,
      partner: {
        visible: true,
        progress: 0.61,
      },
      environment: {
        timeOfDay: "day",
      },
    });

    expect(state).toEqual({
      schemaVersion: 1,
      routeId: "first-ascent",
      seasonId: "season-1",
      biome: "forest",
      checkpointIndex: 1,
      checkpointProgress: expect.any(Number),
      showPartner: true,
      partnerProgress: 0.61,
      environment: {
        timeOfDay: "day",
      },
    });
  });
});

describe("journey render policy", () => {
  it("disables runtime rendering when feature is off", () => {
    const policy = resolveJourneyRenderPolicy({
      assetVersion: "v1",
      journeyEnabled: false,
      videoEnabled: true,
      riveEnabled: true,
      reducedMotionPreferred: false,
      lowPowerMode: false,
      lifecyclePaused: false,
    });

    expect(policy).toEqual({
      assetVersion: "v1",
      motionMode: "still",
      qualityTier: "standard",
      videoEnabled: false,
      riveEnabled: false,
      lifecyclePaused: true,
    });
  });

  it("downgrades to reduced mode for low power", () => {
    const policy = resolveJourneyRenderPolicy({
      assetVersion: "v1",
      journeyEnabled: true,
      videoEnabled: true,
      riveEnabled: true,
      reducedMotionPreferred: false,
      lowPowerMode: true,
      lifecyclePaused: false,
      userMotionPreference: "full",
    });

    expect(policy.motionMode).toBe("reduced");
    expect(policy.videoEnabled).toBe(true);
    expect(policy.riveEnabled).toBe(true);
  });
});

describe("journey effects", () => {
  it("consumes each effect event id once", () => {
    const consumed = new Set<string>();
    const event = createJourneyEffectEvent({
      kind: "checkpoint",
      sourceEventId: "completion-1",
      occurredAt: "2026-08-16T16:00:00.000Z",
    });

    expect(consumeJourneyEffectEvent(consumed, event)).toBe(true);
    expect(consumeJourneyEffectEvent(consumed, event)).toBe(false);
  });
});

describe("asset manifest", () => {
  it("parses the bundled default manifest", () => {
    const parsed = parseJourneyAssetManifest(defaultJourneyAssetManifest);
    expect(parsed?.assetVersion).toBe("v1");
    expect(parsed?.scenes).toHaveLength(5);
  });

  it("rejects invalid manifest payloads", () => {
    const parsed = parseJourneyAssetManifest({
      schemaVersion: 1,
      assetVersion: "v1",
      scenes: [],
    });
    expect(parsed).toBeNull();
  });
});
