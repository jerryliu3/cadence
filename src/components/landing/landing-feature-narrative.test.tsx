import { describe, expect, it } from "vitest";
import { selectFeatureIndex } from "@/components/landing/landing-feature-narrative";

describe("selectFeatureIndex", () => {
  it("selects scenes in visual order around one viewport anchor", () => {
    expect(selectFeatureIndex([300, 900, 1500], 320)).toBe(0);
    expect(selectFeatureIndex([-300, 300, 900], 320)).toBe(1);
    expect(selectFeatureIndex([-900, -300, 300], 320)).toBe(2);
  });
});
