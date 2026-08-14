"use client";

import { useMemo } from "react";
import { useXpProfile } from "@/components/xp/xp-profile-provider";

const nearRidgePath =
  "M0,220 C120,198 210,236 330,220 C500,196 630,130 770,164 C920,198 1080,272 1260,252 C1340,242 1400,216 1440,198 L1440,320 L0,320 Z";
const farRidgePath =
  "M0,210 C180,166 320,196 460,188 C620,178 740,116 920,130 C1060,140 1200,186 1440,160 L1440,320 L0,320 Z";

export function AltitudeBackdrop() {
  const { band } = useXpProfile();

  const skyStyle = useMemo(
    () => ({
      backgroundImage: `linear-gradient(180deg, ${band.skyTop} 0%, ${band.skyBottom} 100%)`,
    }),
    [band.skyBottom, band.skyTop]
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      data-motion="altitude-backdrop"
    >
      <div className="absolute inset-0 transition-colors duration-500 ease-[var(--motion-ease-standard)]" style={skyStyle} />
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[56%] w-full translate-y-8 transition-all duration-500 ease-[var(--motion-ease-standard)]"
      >
        <path d={farRidgePath} fill={band.ridgeFar} />
      </svg>
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[58%] w-full transition-all duration-500 ease-[var(--motion-ease-standard)]"
      >
        <path d={nearRidgePath} fill={band.ridgeNear} />
      </svg>
    </div>
  );
}
