import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  defaultJourneyAssetManifest,
  parseJourneyAssetManifest,
  type JourneyAssetManifest,
} from "@cadence/shared/journey";
import { api } from "../../lib/api";

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
    let cancelled = false;
    const key = cacheKey(assetVersion);

    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) {
          return;
        }
        let parsed: JourneyAssetManifest | null = null;
        try {
          parsed = parseJourneyAssetManifest(JSON.parse(raw));
        } catch {
          parsed = null;
        }
        if (!parsed) {
          return;
        }
        setResolution({
          assetVersion,
          manifest: parsed,
          source: "lkg",
        });
      })
      .catch(() => {
        // Ignore local cache errors.
      });

    void api
      .getJson<unknown>(`/journey-assets/${assetVersion}/manifest.json`)
      .then((body) => {
        if (cancelled) {
          return;
        }
        const parsed = parseJourneyAssetManifest(body);
        if (!parsed) {
          return;
        }
        void AsyncStorage.setItem(key, JSON.stringify(parsed));
        setResolution({
          assetVersion,
          manifest: parsed,
          source: "remote",
        });
      })
      .catch(() => {
        // Keep bundled/LKG manifest on remote failures.
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
