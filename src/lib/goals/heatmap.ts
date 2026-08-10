export function getHeatmapScaleClass(count: number) {
  if (count <= 0) {
    return "heatmap-scale-0";
  }
  if (count === 1) {
    return "heatmap-scale-1";
  }
  if (count === 2) {
    return "heatmap-scale-2";
  }
  if (count === 3) {
    return "heatmap-scale-3";
  }
  return "heatmap-scale-4";
}
