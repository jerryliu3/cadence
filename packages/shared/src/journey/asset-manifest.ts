import { z } from "zod";
import type { JourneyBiome } from "./contract";

export interface AssetSource {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  bytes?: number;
  checksum?: string;
}

export interface JourneySceneAsset {
  id: string;
  version: string;
  biome: JourneyBiome;
  poster: {
    mobile: AssetSource;
    desktop: AssetSource;
  };
  video: {
    mobile: AssetSource[];
    desktop: AssetSource[];
  };
  focalPoint: {
    mobile: { x: number; y: number };
    desktop: { x: number; y: number };
  };
  scrim: {
    opacity: number;
    position: "full" | "top" | "bottom" | "center";
  };
  loopDurationMs: number;
  fallbackSceneId: string | null;
  minimumAppVersion?: string;
}

export interface JourneyAssetManifest {
  schemaVersion: 1;
  assetVersion: string;
  expiresAt: string | null;
  scenes: JourneySceneAsset[];
}

const assetSourceSchema = z.object({
  url: z.string().url(),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive().optional(),
  checksum: z.string().min(1).optional(),
});

const focalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const journeySceneAssetSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  biome: z.enum(["basecamp", "forest", "ridge", "alpine", "summit"]),
  poster: z.object({
    mobile: assetSourceSchema,
    desktop: assetSourceSchema,
  }),
  video: z.object({
    mobile: z.array(assetSourceSchema),
    desktop: z.array(assetSourceSchema),
  }),
  focalPoint: z.object({
    mobile: focalPointSchema,
    desktop: focalPointSchema,
  }),
  scrim: z.object({
    opacity: z.number().min(0).max(1),
    position: z.enum(["full", "top", "bottom", "center"]),
  }),
  loopDurationMs: z.number().int().positive(),
  fallbackSceneId: z.string().min(1).nullable(),
  minimumAppVersion: z.string().min(1).optional(),
});

const journeyAssetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assetVersion: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  scenes: z.array(journeySceneAssetSchema).min(1),
});

function defaultSceneAsset(
  biome: JourneyBiome,
  fallbackSceneId: string | null
): JourneySceneAsset {
  const base = `https://cdn.cadence.app/journey/v1/${biome}`;
  return {
    id: `${biome}-v1`,
    version: "v1",
    biome,
    poster: {
      mobile: {
        url: `${base}/poster-mobile.webp`,
        mimeType: "image/webp",
        width: 1080,
        height: 1920,
      },
      desktop: {
        url: `${base}/poster-desktop.webp`,
        mimeType: "image/webp",
        width: 1920,
        height: 1080,
      },
    },
    video: {
      mobile: [
        {
          url: `${base}/loop-mobile.mp4`,
          mimeType: "video/mp4",
          width: 1080,
          height: 1920,
        },
      ],
      desktop: [
        {
          url: `${base}/loop-desktop.mp4`,
          mimeType: "video/mp4",
          width: 1920,
          height: 1080,
        },
      ],
    },
    focalPoint: {
      mobile: { x: 0.5, y: 0.38 },
      desktop: { x: 0.52, y: 0.34 },
    },
    scrim: {
      opacity: 0.42,
      position: "full",
    },
    loopDurationMs: 12_000,
    fallbackSceneId,
  };
}

export const defaultJourneyAssetManifest: JourneyAssetManifest = {
  schemaVersion: 1,
  assetVersion: "v1",
  expiresAt: null,
  scenes: [
    defaultSceneAsset("basecamp", null),
    defaultSceneAsset("forest", "basecamp-v1"),
    defaultSceneAsset("ridge", "forest-v1"),
    defaultSceneAsset("alpine", "ridge-v1"),
    defaultSceneAsset("summit", "alpine-v1"),
  ],
};

export function parseJourneyAssetManifest(
  value: unknown
): JourneyAssetManifest | null {
  const parsed = journeyAssetManifestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveJourneySceneAsset({
  manifest,
  biome,
}: {
  manifest: JourneyAssetManifest;
  biome: JourneyBiome;
}) {
  const scene = manifest.scenes.find((candidate) => candidate.biome === biome);
  if (scene) {
    return scene;
  }
  return manifest.scenes[0];
}
