import { describe, expect, it } from "vitest";
import { resolvePlannerDndResolution } from "@/features/planner/planner-dnd-resolution";
import { buildPlannerDayEntry } from "@/features/planner/test-fixtures";

describe("resolvePlannerDndResolution", () => {
  it("returns preview reorder for same-day preview drop targets", () => {
    const entry = buildPlannerDayEntry({ key: "goal-1:unit-1" });
    const resolution = resolvePlannerDndResolution({
      entryKey: entry.key,
      target: { type: "preview_entry", day: "2026-08-15", entryKey: "goal-2:unit-1" },
      entryByKey: new Map([[entry.key, entry]]),
      entryDayByKey: new Map([[entry.key, "2026-08-15"]]),
    });

    expect(resolution).toEqual({
      kind: "reorder_preview",
      day: "2026-08-15",
      activeEntryKey: "goal-1:unit-1",
      overEntryKey: "goal-2:unit-1",
    });
  });

  it("returns move action for cross-day preview drop targets", () => {
    const entry = buildPlannerDayEntry({ key: "goal-1:unit-1" });
    const resolution = resolvePlannerDndResolution({
      entryKey: entry.key,
      target: { type: "preview_entry", day: "2026-08-16", entryKey: "goal-2:unit-1" },
      entryByKey: new Map([[entry.key, entry]]),
      entryDayByKey: new Map([[entry.key, "2026-08-15"]]),
    });

    expect(resolution.kind).toBe("move_entry");
    if (resolution.kind !== "move_entry") {
      throw new Error("Expected move_entry resolution.");
    }
    expect(resolution.entry.key).toBe(entry.key);
    expect(resolution.nextDate).toBe("2026-08-16");
  });

  it("returns move action for day drop targets", () => {
    const entry = buildPlannerDayEntry({ key: "goal-1:unit-1" });
    const resolution = resolvePlannerDndResolution({
      entryKey: entry.key,
      target: { type: "day", day: "2026-08-20" },
      entryByKey: new Map([[entry.key, entry]]),
      entryDayByKey: new Map([[entry.key, "2026-08-15"]]),
    });

    expect(resolution.kind).toBe("move_entry");
    if (resolution.kind !== "move_entry") {
      throw new Error("Expected move_entry resolution.");
    }
    expect(resolution.nextDate).toBe("2026-08-20");
  });

  it("returns clear when target is null or entry is missing", () => {
    const entry = buildPlannerDayEntry({ key: "goal-1:unit-1" });
    const noTarget = resolvePlannerDndResolution({
      entryKey: entry.key,
      target: null,
      entryByKey: new Map([[entry.key, entry]]),
      entryDayByKey: new Map([[entry.key, "2026-08-15"]]),
    });
    const missingEntry = resolvePlannerDndResolution({
      entryKey: entry.key,
      target: { type: "day", day: "2026-08-20" },
      entryByKey: new Map(),
      entryDayByKey: new Map(),
    });

    expect(noTarget).toEqual({ kind: "clear" });
    expect(missingEntry).toEqual({ kind: "clear" });
  });
});
