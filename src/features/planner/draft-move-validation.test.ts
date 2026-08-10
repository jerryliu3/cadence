import { describe, expect, it } from "vitest";
import { decideDraftMove } from "@/features/planner/draft-move-validation";
import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

const GOAL = "10000000-0000-4000-8000-000000000001";
const isValidIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function entry(overrides: Partial<PlannerDayDetailEntry> = {}) {
  return {
    key: "entry-1",
    originalGoalId: GOAL,
    unitKey: "total:1",
    draftGhost: false,
    goalTitle: "Practice",
    label: null,
    creditState: "uncredited",
    classification: "open",
    activeItem: null,
    ...overrides,
  } as PlannerDayDetailEntry;
}

function unit(overrides: Partial<PlannerWorkUnit> = {}) {
  return {
    originalGoalId: GOAL,
    unitKey: "total:1",
    scheduledDate: "2026-08-05",
    draftMoveWindow: { start: "2026-08-01", end: "2026-08-31" },
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    ...overrides,
  } as PlannerWorkUnit;
}

function decide(args: Partial<Parameters<typeof decideDraftMove>[0]> = {}) {
  return decideDraftMove({
    entry: entry(),
    nextDate: "2026-08-10",
    baselineUnit: unit(),
    moveConflictByGoalDate: new Map(),
    completionFactUnitsByGoalDate: new Map(),
    isValidIsoDate,
    ...args,
  });
}

describe("decideDraftMove", () => {
  it("accepts a move inside the window and trims the date", () => {
    expect(decide({ nextDate: " 2026-08-10 " })).toEqual({
      ok: true,
      scheduledDate: "2026-08-10",
    });
  });

  it("rejects a ghost marker", () => {
    const result = decide({ entry: entry({ draftGhost: true }) });
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toContain(
      "preview markers"
    );
  });

  it("rejects a malformed date", () => {
    expect(decide({ nextDate: "not-a-date" })).toEqual({
      ok: false,
      message: "Pick a valid move date.",
    });
  });

  it("rejects a unit missing from the preview", () => {
    expect(decide({ baselineUnit: undefined })).toEqual({
      ok: false,
      message: "This session is unavailable in the current preview.",
    });
  });

  it("rejects a unit with no movable window", () => {
    expect(
      decide({
        baselineUnit: unit({ draftMoveWindow: null, placementWindow: null }),
      })
    ).toEqual({
      ok: false,
      message: "This session does not have a movable placement window.",
    });
  });

  it("falls back to the placement window when no draft window exists", () => {
    expect(
      decide({
        baselineUnit: unit({
          draftMoveWindow: null,
          placementWindow: { start: "2026-08-01", end: "2026-08-31" },
        }),
      })
    ).toEqual({ ok: true, scheduledDate: "2026-08-10" });
  });

  it("rejects a date before the window and names the earliest", () => {
    expect(decide({ nextDate: "2026-07-20" })).toEqual({
      ok: false,
      message: "This session can only move on or after 2026-08-01.",
    });
  });

  it("names the credit window when the date runs past it", () => {
    const result = decide({
      nextDate: "2026-09-15",
      baselineUnit: unit({ creditWindow: { start: "2026-08-01", end: "2026-08-31" } }),
    });
    expect((result as { message: string }).message).toContain(
      "credit window end (2026-08-31)"
    );
  });

  it("names the planner window when the date is past it but still creditable", () => {
    const result = decide({
      nextDate: "2026-09-15",
      baselineUnit: unit({ creditWindow: { start: "2026-08-01", end: "2026-09-30" } }),
    });
    expect((result as { message: string }).message).toContain(
      "allowed planner window (2026-08-01 to 2026-08-31)"
    );
  });

  it("rejects a date the same goal already occupies", () => {
    expect(
      decide({
        moveConflictByGoalDate: new Map([
          [`${GOAL}:2026-08-10`, new Set(["entry-other"])],
        ]),
      })
    ).toEqual({
      ok: false,
      message: "That goal already has a planner session on the selected date.",
    });
  });

  it("allows a move onto the date the entry itself already holds", () => {
    expect(
      decide({
        moveConflictByGoalDate: new Map([
          [`${GOAL}:2026-08-10`, new Set(["entry-1"])],
        ]),
      })
    ).toEqual({ ok: true, scheduledDate: "2026-08-10" });
  });

  it("rejects a date credited from another session", () => {
    const result = decide({
      completionFactUnitsByGoalDate: new Map([
        [
          `${GOAL}:2026-08-10`,
          [unit({ unitKey: "total:2", scheduledDate: "2026-08-04" })],
        ],
      ]),
    });
    expect((result as { message: string }).message).toContain(
      "credited from the 2026-08-04 session"
    );
  });

  it("rejects a date carrying a completion fact with no source session", () => {
    expect(
      decide({
        completionFactUnitsByGoalDate: new Map([
          [
            `${GOAL}:2026-08-10`,
            [unit({ unitKey: "total:2", scheduledDate: null })],
          ],
        ]),
      })
    ).toEqual({
      ok: false,
      message: "That date already has a completion fact for this goal.",
    });
  });

  it("ignores a completion fact belonging to the entry itself", () => {
    expect(
      decide({
        completionFactUnitsByGoalDate: new Map([
          [`${GOAL}:2026-08-10`, [unit({ unitKey: "total:1" })]],
        ]),
      })
    ).toEqual({ ok: true, scheduledDate: "2026-08-10" });
  });
});
