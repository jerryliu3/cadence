"use client";

import { useEffect, useState } from "react";
import {
  defaultJourneyAssetManifest,
  parseJourneyAssetManifest,
  type JourneyAssetManifest,
} from "@cadence/shared/journey";

const CACHE_KEY_PREFIX = "journey.manifest.lkg.";

interface ManifestResolution {
  assetVersion: string;
  manifest: JourneyAssetManifest;
  source: "bundled" | "remote" | "lkg";
}

function cacheKey(assetVersion: string) {
  return `${CACHE_KEY_PREFIX}${assetVersion}`;
}

export function useJourneyManifest(assetVersion: string): ManifestResolution {
  const [resolution, setResolution] = useState<ManifestResolution>({
    assetVersion,
    manifest: defaultJourneyAssetManifest,
    source: "bundled",
  });

  useEffect(() => {
    const key = cacheKey(assetVersion);
    let cancelled = false;

    queueMicrotask(() => {
      const lkgRaw = window.localStorage.getItem(key);
      if (!lkgRaw || cancelled) {
        return;
      }
      try {
        const parsed = parseJourneyAssetManifest(JSON.parse(lkgRaw));
        if (parsed) {
          setResolution({
            assetVersion,
            manifest: parsed,
            source: "lkg",
          });
        }
      } catch {
        // Ignore corrupted cached payloads.
      }
    });

    void fetch(`/journey-assets/${assetVersion}/manifest.json`, {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const body = (await response.json()) as unknown;
        return parseJourneyAssetManifest(body);
      })
      .then((parsed) => {
        if (cancelled || !parsed) {
          return;
        }
        window.localStorage.setItem(key, JSON.stringify(parsed));
        setResolution({
          assetVersion,
          manifest: parsed,
          source: "remote",
        });
      })
      .catch(() => {
        // Keep bundled/LKG manifest.
      });

    return () => {
      cancelled = true;
    };
  }, [assetVersion]);

  if (resolution.assetVersion !== assetVersion) {
    return {
      assetVersion,
      manifest: defaultJourneyAssetManifest,
      source: "bundled",
    };
  }

  return resolution;
}
