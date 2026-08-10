import { describe, expect, it } from "vitest";
import { getHeatmapScaleClass } from "./heatmap";

describe("getHeatmapScaleClass", () => {
  it("maps counts into the five heatmap scale buckets", () => {
    expect(getHeatmapScaleClass(0)).toBe("heatmap-scale-0");
    expect(getHeatmapScaleClass(1)).toBe("heatmap-scale-1");
    expect(getHeatmapScaleClass(2)).toBe("heatmap-scale-2");
    expect(getHeatmapScaleClass(3)).toBe("heatmap-scale-3");
    expect(getHeatmapScaleClass(4)).toBe("heatmap-scale-4");
    expect(getHeatmapScaleClass(99)).toBe("heatmap-scale-4");
  });
});
