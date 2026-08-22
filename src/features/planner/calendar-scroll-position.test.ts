import { describe, expect, it } from "vitest";
import {
  getCalendarTargetScrollLeft,
  getCalendarTargetScrollTop,
  isCalendarDayVisible,
} from "@/features/planner/calendar-scroll-position";

function rect({
  left = 0,
  top = 0,
  width = 0,
  height = 0,
}: {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}): DOMRect {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("calendar scroll positions", () => {
  it("centers a horizontal target using scroll-container coordinates", () => {
    const container = document.createElement("div");
    const target = document.createElement("div");
    container.scrollLeft = 120;
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 900 },
    });
    container.getBoundingClientRect = () => rect({ left: 40, width: 300 });
    target.getBoundingClientRect = () => rect({ left: 440, width: 100 });

    expect(getCalendarTargetScrollLeft(container, target)).toBe(420);
  });

  it("aligns a vertical target to the container top", () => {
    const container = document.createElement("div");
    const target = document.createElement("div");
    container.scrollTop = 200;
    container.getBoundingClientRect = () => rect({ top: 80, height: 500 });
    target.getBoundingClientRect = () => rect({ top: 380, height: 96 });

    expect(getCalendarTargetScrollTop(container, target)).toBe(500);
  });

  it("treats a partially intersecting day as visible", () => {
    const container = document.createElement("div");
    const target = document.createElement("button");
    target.dataset.dayCell = "true";
    target.dataset.day = "2026-08-22";
    container.append(target);
    container.getBoundingClientRect = () =>
      rect({ left: 0, top: 0, width: 300, height: 500 });
    target.getBoundingClientRect = () =>
      rect({ left: 250, top: 100, width: 100, height: 96 });

    expect(
      isCalendarDayVisible(container, "2026-08-22", {
        checkVertical: false,
      })
    ).toBe(true);
  });
});
