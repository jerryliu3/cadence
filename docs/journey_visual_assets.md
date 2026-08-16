# Journey Visual Assets

## Purpose

Define a stable contract for mountain-journey visual assets so web and mobile
can render the same progression state with platform-specific runtime policies.

## Scene Pack Requirements

Each biome scene pack must include:

- `poster-mobile` (first paint + still mode)
- `poster-desktop` (first paint + still mode)
- `loop-mobile` (ambient motion mode)
- `loop-desktop` (ambient motion mode)
- optional reduced-motion compatible still variant

Core launch biomes:

1. `basecamp`
2. `forest`
3. `ridge`
4. `alpine`
5. `summit`

## Manifest Contract

The app consumes validated JSON with this shape:

- `schemaVersion`
- `assetVersion`
- `expiresAt`
- `scenes[]`

Each scene contains:

- `id`, `version`, `biome`
- `poster.mobile`, `poster.desktop`
- `video.mobile[]`, `video.desktop[]`
- `focalPoint.mobile`, `focalPoint.desktop`
- `scrim.opacity`, `scrim.position`
- `loopDurationMs`
- `fallbackSceneId`
- optional `minimumAppVersion`

## Runtime Fallback Rules

1. Use bundled default manifest immediately.
2. Attempt remote manifest load for active `assetVersion`.
3. Validate with shared zod schema before use.
4. If valid, cache as last-known-good (LKG).
5. If remote fails or is invalid, keep bundled/LKG manifest.
6. Never blank planner surfaces for manifest or media failures.

## Asset Integrity

- Prefer immutable versioned URLs.
- Include checksum metadata when available.
- Keep scene-level fallback links valid.
- Avoid baked text/progress numbers in visual media.

## Performance Budget Gates

Final numeric thresholds are set after Phase 1 art proof. Phase 2 release
candidates must satisfy them.

Budget categories:

- max poster bytes
- max mobile loop bytes
- max desktop loop bytes
- mount-to-poster latency
- mount-to-first-frame latency
- transition memory peak delta
- dropped-frame envelope during checklist interaction
- max simultaneous active players
- planner-session media transfer envelope (cold and warm cache)

## Telemetry Fields

Required journey telemetry events should capture:

- `sceneId`
- `assetVersion`
- `motionMode`
- `qualityTier`
- `cacheResult` (`cold`, `warm`, `lkg`, `bundled`)
- `durationMs`
- normalized `failureReason` when relevant

## Rollback Expectations

Feature flags support partial rollback:

- `journey.enabled`
- `journey.videoEnabled`
- `journey.riveEnabled`
- `journey.socialOverlayEnabled`
- `journey.assetManifestVersion`

Rollbacks must preserve poster-first readability and canonical functional UI.
