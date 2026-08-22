import { describe, expect, it } from "vitest";
import {
  accountabilityEvents,
  featureScenes,
  progressMetrics,
  selectFeatureIndex,
} from "@/components/landing/landing-feature-narrative";

describe("selectFeatureIndex", () => {
  it("selects scenes in visual order around one viewport anchor", () => {
    expect(selectFeatureIndex([300, 900, 1500], 320)).toBe(0);
    expect(selectFeatureIndex([-300, 300, 900], 320)).toBe(1);
    expect(selectFeatureIndex([-900, -300, 300], 320)).toBe(2);
  });
});

describe("landing narrative seeds", () => {
  it("uses shipped progress and accountability concepts", () => {
    expect(progressMetrics.map((metric) => metric.label)).toEqual([
      "Completion rate",
      "Current month activities",
      "Active streak",
    ]);
    expect(accountabilityEvents.map((event) => event.kind)).toEqual([
      "feed",
      "nudge",
    ]);
    expect(featureScenes[2].supportingText).not.toMatch(/request feedback/i);
  });
});
