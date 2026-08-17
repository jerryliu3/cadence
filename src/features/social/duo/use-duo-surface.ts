"use client";

import { useEffect, useMemo } from "react";
import { useDuo, useDuoScope } from "@/features/social/duo/duo-context";
import type { DuoLaneSubject } from "@/features/social/duo/duo-lanes";
import { DUO_SURFACE_DEFAULTS } from "@/lib/social/duo/surface-defaults";
import { reportDuoTelemetry } from "@/lib/social/duo/telemetry";

type DuoLaneSurface = keyof typeof DUO_SURFACE_DEFAULTS;

/**
 * One entry point per duo surface: resolves the scope against that surface's
 * default, reports the `scope_viewed` sample, and builds the lane subjects.
 *
 * Insights, Checklist, and Calendar all needed the same three things, and
 * keeping them together is what stops the surface default, the telemetry
 * `surface` tag, and the lane labels from drifting apart.
 */
export function useDuoSurface(surface: DuoLaneSurface) {
  const { viewerLabel } = useDuo();
  const { scope, activePartner, setScopePreference } = useDuoScope(
    DUO_SURFACE_DEFAULTS[surface]
  );

  useEffect(() => {
    reportDuoTelemetry("scope_viewed", {
      surface,
      scope,
      hasPartner: Boolean(activePartner),
    });
  }, [activePartner, scope, surface]);

  const viewer = useMemo<DuoLaneSubject>(
    () => ({
      id: "viewer",
      label: viewerLabel.trim().length > 0 ? viewerLabel : "You",
      readOnly: false,
    }),
    [viewerLabel]
  );

  const partner = useMemo<DuoLaneSubject | null>(
    () =>
      activePartner
        ? {
            id: "partner",
            label:
              activePartner.partnerDisplayName ??
              activePartner.partnerUsername ??
              "Partner",
            userId: activePartner.partnerId,
            readOnly: true,
            avatarUrl: activePartner.partnerAvatarUrl,
          }
        : null,
    [activePartner]
  );

  return { scope, activePartner, setScopePreference, viewer, partner } as const;
}
