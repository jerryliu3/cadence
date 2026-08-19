"use client";

import { useEffect, useState } from "react";
import {
  defaultJourneyAssetManifest,
  parseJourneyActiveManifestPointer,
  parseJourneyAssetManifest,
  type JourneyAssetManifest,
} from "@cadence/shared/journey";

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

    queueMicrotask(() => {
      const lkgRaw = window.localStorage.getItem(ACTIVE_CACHE_KEY);
      if (!lkgRaw || cancelled) {
        return;
      }
      try {
        const parsed = parseJourneyAssetManifest(JSON.parse(lkgRaw));
        if (parsed) {
          setResolution({
            assetVersion: parsed.assetVersion,
            manifest: parsed,
            source: "lkg",
          });
        }
      } catch {
        // Ignore corrupted cached payloads.
      }
    });

    void (async () => {
      const pointerResponse = await fetch(ACTIVE_POINTER_PATH, {
        method: "GET",
        cache: "no-store",
      });
      if (!pointerResponse.ok || cancelled) {
        return;
      }

      const pointerBody = (await pointerResponse.json()) as unknown;
      const pointer = parseJourneyActiveManifestPointer(pointerBody);
      if (!pointer || cancelled) {
        return;
      }

      const manifestResponse = await fetch(pointer.manifestUrl, {
        method: "GET",
        cache: "no-store",
      });
      if (!manifestResponse.ok || cancelled) {
        return;
      }

      const manifestBody = (await manifestResponse.json()) as unknown;
      const parsed = parseJourneyAssetManifest(manifestBody);
      if (!parsed || parsed.assetVersion !== pointer.assetVersion || cancelled) {
        return;
      }

      window.localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(parsed));
      setResolution({
        assetVersion: parsed.assetVersion,
        manifest: parsed,
        source: "remote",
      });
    })().catch(() => {
      // Keep bundled/LKG manifest.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return resolution;
}
