import { describe, expect, it } from "vitest";
import { hitTestDropTarget } from "./drop-targets";

const rect = { x: 0, y: 0, width: 100, height: 100 };

describe("hitTestDropTarget", () => {
  it("ignores stale sessions outside the current calendar surface", () => {
    expect(
      hitTestDropTarget({
        x: 20,
        y: 20,
        surfaceKey: "week|2026-08|2026-08-10,2026-08-11",
        visibleDays: ["2026-08-10", "2026-08-11"],
        sessions: [
          {
            surfaceKey: "day|2026-07|2026-07-20",
            day: "2026-07-20",
            entryKey: "stale:total:1",
            rect,
          },
        ],
        days: [
          {
            surfaceKey: "week|2026-08|2026-08-10,2026-08-11",
            day: "2026-08-10",
            inMonth: true,
            rect,
          },
        ],
      })
    ).toEqual({ type: "day", day: "2026-08-10", inMonth: true });
  });

  it("ignores targets whose day is not visible", () => {
    expect(
      hitTestDropTarget({
        x: 20,
        y: 20,
        surfaceKey: "week|2026-08|2026-08-10",
        visibleDays: ["2026-08-10"],
        sessions: [
          {
            surfaceKey: "week|2026-08|2026-08-10",
            day: "2026-08-12",
            entryKey: "hidden:total:1",
            rect,
          },
        ],
        days: [],
      })
    ).toBeNull();
  });
});
