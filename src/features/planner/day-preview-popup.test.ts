import { describe, expect, it } from "vitest";
import { computeDayPreviewPosition } from "./day-preview-popup";

describe("computeDayPreviewPosition", () => {
  it("clamps horizontal placement and prefers below when above is unavailable", () => {
    const position = computeDayPreviewPosition({
      rect: { top: 10, left: 10, width: 24, height: 24 },
      viewportWidth: 360,
      viewportHeight: 640,
    });

    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + position.width).toBeLessThanOrEqual(352);
    expect(position.placement).toBe("below");
    expect(position.top).toBe(42);
  });

  it("anchors directly above when there is enough room", () => {
    const position = computeDayPreviewPosition({
      rect: { top: 420, left: 140, width: 24, height: 24 },
      viewportWidth: 480,
      viewportHeight: 700,
    });
    expect(position.placement).toBe("above");
    expect(position.top).toBe(412);
  });
});
