import { describe, expect, it } from "vitest";
import { resolveLanePageWidth, shouldUseLanePager } from "./lane-pager";

describe("lane pager helpers", () => {
  it("enables lane paging only when multiple lanes are visible", () => {
    expect(shouldUseLanePager(1)).toBe(false);
    expect(shouldUseLanePager(2)).toBe(true);
  });

  it("keeps lane pages wide enough for compact screens", () => {
    expect(resolveLanePageWidth(320)).toBe(288);
    expect(resolveLanePageWidth(520)).toBe(488);
  });
});
