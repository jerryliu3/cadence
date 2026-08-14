import { minTotalXpForLevel } from "@/lib/xp/progression";

export interface XpAltitudeBand {
  id: "trailhead" | "foothills" | "treeline" | "ridgeline" | "alpine" | "summit";
  name: string;
  minXp: number;
  nextBandMinXp: number | null;
  progressToNextBand: number;
  skyTop: string;
  skyBottom: string;
  ridgeNear: string;
  ridgeFar: string;
}

const ALTITUDE_BAND_LEVELS = [1, 5, 7, 10, 15, 23] as const;

const altitudeBands = [
  {
    id: "trailhead" as const,
    name: "Trailhead",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[0]),
    skyTop: "oklch(0.95 0.02 220)",
    skyBottom: "oklch(0.88 0.03 205)",
    ridgeNear: "oklch(0.45 0.06 180)",
    ridgeFar: "oklch(0.62 0.05 200)",
  },
  {
    id: "foothills" as const,
    name: "Foothills",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[1]),
    skyTop: "oklch(0.92 0.03 200)",
    skyBottom: "oklch(0.83 0.05 185)",
    ridgeNear: "oklch(0.43 0.07 170)",
    ridgeFar: "oklch(0.59 0.07 190)",
  },
  {
    id: "treeline" as const,
    name: "Treeline",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[2]),
    skyTop: "oklch(0.88 0.04 175)",
    skyBottom: "oklch(0.78 0.07 165)",
    ridgeNear: "oklch(0.4 0.08 155)",
    ridgeFar: "oklch(0.55 0.09 175)",
  },
  {
    id: "ridgeline" as const,
    name: "Ridgeline",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[3]),
    skyTop: "oklch(0.83 0.05 140)",
    skyBottom: "oklch(0.7 0.09 135)",
    ridgeNear: "oklch(0.36 0.09 130)",
    ridgeFar: "oklch(0.51 0.1 145)",
  },
  {
    id: "alpine" as const,
    name: "Alpine",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[4]),
    skyTop: "oklch(0.72 0.08 95)",
    skyBottom: "oklch(0.6 0.12 85)",
    ridgeNear: "oklch(0.33 0.1 80)",
    ridgeFar: "oklch(0.47 0.1 100)",
  },
  {
    id: "summit" as const,
    name: "Summit",
    minXp: minTotalXpForLevel(ALTITUDE_BAND_LEVELS[5]),
    skyTop: "oklch(0.62 0.11 35)",
    skyBottom: "oklch(0.5 0.13 25)",
    ridgeNear: "oklch(0.3 0.09 20)",
    ridgeFar: "oklch(0.42 0.09 35)",
  },
];

function resolveProgress({
  totalXp,
  minXp,
  nextBandMinXp,
}: {
  totalXp: number;
  minXp: number;
  nextBandMinXp: number | null;
}) {
  if (nextBandMinXp === null) {
    return 1;
  }
  const clampedXp = Math.max(totalXp, minXp);
  const span = nextBandMinXp - minXp;
  if (span <= 0) {
    return 1;
  }
  const progress = (clampedXp - minXp) / span;
  return Math.max(0, Math.min(progress, 1));
}

export function bandForTotalXp(totalXp: number): XpAltitudeBand {
  const normalizedTotal = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  const activeIndex = altitudeBands.findLastIndex((band) => normalizedTotal >= band.minXp);
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;
  const activeBand = altitudeBands[safeIndex];
  const nextBand = altitudeBands[safeIndex + 1] ?? null;

  return {
    ...activeBand,
    nextBandMinXp: nextBand?.minXp ?? null,
    progressToNextBand: resolveProgress({
      totalXp: normalizedTotal,
      minXp: activeBand.minXp,
      nextBandMinXp: nextBand?.minXp ?? null,
    }),
  };
}
