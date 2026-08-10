import { describe, expect, it } from "vitest";
import { buildShareMenuPosition } from "./social-share-menu-position";

function buildRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 100,
    top: 200,
    right: 320,
    bottom: 240,
    width: 220,
    height: 40,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe("buildShareMenuPosition", () => {
  it("positions below when enough space is available", () => {
    const position = buildShareMenuPosition({
      anchorRect: buildRect(),
      viewportWidth: 1200,
      viewportHeight: 900,
    });

    expect(position.top).toBe(248);
    expect(position.bottom).toBeUndefined();
    expect(position.maxHeight).toBeGreaterThanOrEqual(160);
  });

  it("positions above when there is not enough room below", () => {
    const position = buildShareMenuPosition({
      anchorRect: buildRect({ top: 700, bottom: 740 }),
      viewportWidth: 1200,
      viewportHeight: 780,
    });

    expect(position.bottom).toBe(88);
    expect(position.top).toBeUndefined();
    expect(position.maxHeight).toBeGreaterThanOrEqual(160);
  });
});
