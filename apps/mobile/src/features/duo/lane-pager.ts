const LANE_PAGE_HORIZONTAL_PADDING = 32;
const MIN_LANE_PAGE_WIDTH = 288;

export function shouldUseLanePager(laneCount: number): boolean {
  return laneCount > 1;
}

export function resolveLanePageWidth(viewportWidth: number): number {
  return Math.max(MIN_LANE_PAGE_WIDTH, viewportWidth - LANE_PAGE_HORIZONTAL_PADDING);
}
