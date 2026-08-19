import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  defaultJourneyAssetManifest,
  parseJourneyActiveManifestPointer,
  parseJourneyAssetManifest,
  type JourneyAssetManifest,
} from "@cadence/shared/journey";
import { api } from "../../lib/api";

const ACTIVE_POINTER_PATH = "/journey/active.json";
const ACTIVE_CACHE_KEY = "journey.manifest.lkg.active";

interface ManifestResolution {
  assetVersion: string;
  manifest: JourneyAssetManifest;
  source: "bundled" | "remote" | "lkg";
}

export function useJourneyManifest(): ManifestResolution {
  const [resolution, setResolution] = useState<ManifestResolution>({
    assetVersion: defaultJourneyAssetManifest.assetVersion,
    manifest: defaultJourneyAssetManifest,
    source: "bundled",
  });

  useEffect(() => {
    let cancelled = false;

    void AsyncStorage.getItem(ACTIVE_CACHE_KEY)
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
          assetVersion: parsed.assetVersion,
          manifest: parsed,
          source: "lkg",
        });
      })
      .catch(() => {
        // Ignore local cache errors.
      });

    void api
      .getJson<unknown>(ACTIVE_POINTER_PATH)
      .then((pointerBody) => {
        if (cancelled) {
          return;
        }
        const pointer = parseJourneyActiveManifestPointer(pointerBody);
        if (!pointer) {
          return;
        }

        return fetch(pointer.manifestUrl, {
          method: "GET",
        }).then(async (response) => {
          if (!response.ok || cancelled) {
            return;
          }
          const manifestBody = (await response.json()) as unknown;
          const parsed = parseJourneyAssetManifest(manifestBody);
          if (!parsed || parsed.assetVersion !== pointer.assetVersion || cancelled) {
            return;
          }
          void AsyncStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(parsed));
          setResolution({
            assetVersion: parsed.assetVersion,
            manifest: parsed,
            source: "remote",
          });
        });
      })
      .catch(() => {
        // Keep bundled/LKG manifest on remote failures.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return resolution;
}
