export const heatmapScaleHex = [
  "#E8E6EF",
  "#C6EBD8",
  "#7ED3A8",
  "#34B87A",
  "#1B7F52",
] as const;

export function getHeatmapScaleIndex(count: number) {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  if (count === 3) {
    return 3;
  }
  return 4;
}

export function getHeatmapScaleHex(count: number) {
  return heatmapScaleHex[getHeatmapScaleIndex(count)];
}
