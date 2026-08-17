import { describe, expect, it } from "vitest";
import { resolveGoalPlanningEndDate } from "@/lib/goals/definition-validation";
import type { Goal } from "@/lib/goals/types";
import { getScopeDateRange } from "@/lib/planner/dates";
import {
  getLinkResumeDate,
  isSuppressedInWindow,
  isSuppressedOnDate,
  resolveLinkSuppression,
  toLinkSuppressionSource,
  type LinkSuppressionSource,
} from "@/lib/planner/link-suppression";

function source(overrides: Partial<LinkSuppressionSource>): LinkSuppressionSource {
  const hasEndDate = Object.prototype.hasOwnProperty.call(overrides, "endDate");
  const hasTargetCount = Object.prototype.hasOwnProperty.call(
    overrides,
    "targetCount"
  );
  return {
    id: overrides.id ?? "source-a",
    ownerId: overrides.ownerId ?? "owner-a",
    isDeleted: overrides.isDeleted ?? false,
    archivedAt: overrides.archivedAt ?? null,
    startDate: overrides.startDate ?? "2026-01-01",
    endDate: hasEndDate ? (overrides.endDate as string | null) : "2026-12-31",
    frequencyType: overrides.frequencyType ?? "recurring",
    targetCount: hasTargetCount ? (overrides.targetCount as number | null) : null,
  };
}

describe("toLinkSuppressionSource", () => {
  it("maps goal shape to suppression source fields", () => {
    const goal: Goal = {
      id: "goal-a",
      owner_id: "owner-a",
      title: "Goal A",
      description: null,
      category: "Health",
      color: "#ffffff",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 20,
      milestone_names: null,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      photo_path: null,
      team_id: null,
      is_deleted: false,
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(toLinkSuppressionSource(goal)).toEqual({
      id: "goal-a",
      ownerId: "owner-a",
      isDeleted: false,
      archivedAt: null,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      frequencyType: "recurring",
      targetCount: 20,
    });
  });
});

describe("resolveLinkSuppression", () => {
  const ownerId = "owner-a";
  const asOfDate = "2026-08-15";
  const goalId = "target-a";

  it("returns none with no inbound links", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "source-a", targetGoalId: "other-target" }],
        sourcesById: new Map([["source-a", source({})]]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns none when the source is missing", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "missing-source", targetGoalId: goalId }],
        sourcesById: new Map(),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns none when source owner does not match", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "source-a", targetGoalId: goalId }],
        sourcesById: new Map([
          ["source-a", source({ ownerId: "owner-b" })],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns none when source is deleted or archived", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [
          { sourceGoalId: "source-a", targetGoalId: goalId },
          { sourceGoalId: "source-b", targetGoalId: goalId },
        ],
        sourcesById: new Map([
          ["source-a", source({ id: "source-a", isDeleted: true })],
          ["source-b", source({ id: "source-b", archivedAt: "2026-08-01T00:00:00Z" })],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns none when effective end falls before source start", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "source-a", targetGoalId: goalId }],
        sourcesById: new Map([
          [
            "source-a",
            source({
              startDate: "2026-02-01",
              endDate: "2026-01-01",
              targetCount: 10,
            }),
          ],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "none" });
  });

  it("returns until for finite covering source", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "source-a", targetGoalId: goalId }],
        sourcesById: new Map([
          ["source-a", source({ endDate: "2026-11-20" })],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "until", through: "2026-11-20" });
  });

  it("uses the latest finite through date across inbound sources", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [
          { sourceGoalId: "source-a", targetGoalId: goalId },
          { sourceGoalId: "source-b", targetGoalId: goalId },
        ],
        sourcesById: new Map([
          ["source-a", source({ id: "source-a", endDate: "2026-10-20" })],
          ["source-b", source({ id: "source-b", endDate: "2026-11-15" })],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "until", through: "2026-11-15" });
  });

  it("returns indefinite for open-ended cadence sources", () => {
    expect(
      resolveLinkSuppression({
        goalId,
        links: [{ sourceGoalId: "source-a", targetGoalId: goalId }],
        sourcesById: new Map([
          [
            "source-a",
            source({
              endDate: null,
              frequencyType: "recurring",
              targetCount: null,
            }),
          ],
        ]),
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "indefinite" });
  });

  it("prefers indefinite over finite suppression regardless of link order", () => {
    const links = [
      { sourceGoalId: "source-a", targetGoalId: goalId },
      { sourceGoalId: "source-b", targetGoalId: goalId },
    ];
    const sourcesById = new Map([
      ["source-a", source({ id: "source-a", endDate: "2026-10-20" })],
      [
        "source-b",
        source({
          id: "source-b",
          endDate: null,
          frequencyType: "recurring",
          targetCount: null,
        }),
      ],
    ]);
    expect(
      resolveLinkSuppression({
        goalId,
        links,
        sourcesById,
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "indefinite" });
    expect(
      resolveLinkSuppression({
        goalId,
        links: [...links].reverse(),
        sourcesById,
        ownerId,
        asOfDate,
      })
    ).toEqual({ kind: "indefinite" });
  });

  it("uses soft horizon for ordinal goals without stored end date", () => {
    const suppression = resolveLinkSuppression({
      goalId,
      links: [{ sourceGoalId: "source-a", targetGoalId: goalId }],
      sourcesById: new Map([
        [
          "source-a",
          source({
            endDate: null,
            frequencyType: "fixed_milestones",
            targetCount: 20,
            startDate: "2026-01-01",
          }),
        ],
      ]),
      ownerId,
      asOfDate,
    });
    const expectedEnd = resolveGoalPlanningEndDate({
      frequencyType: "fixed_milestones",
      targetCount: 20,
      startDate: "2026-01-01",
      endDate: null,
      asOfDate,
    });
    expect(suppression).toEqual({ kind: "until", through: expectedEnd });
  });
});

describe("suppression helpers", () => {
  it("supports monotone month coverage even before source start", () => {
    expect(
      isSuppressedInWindow(
        { kind: "until", through: "2026-12-31" },
        getScopeDateRange("2026-08")
      )
    ).toBe(true);
  });

  it("reports suppression window inclusion for finite and indefinite states", () => {
    expect(
      isSuppressedInWindow(
        { kind: "until", through: "2026-08-31" },
        getScopeDateRange("2026-08")
      )
    ).toBe(true);
    expect(
      isSuppressedInWindow(
        { kind: "until", through: "2026-07-31" },
        getScopeDateRange("2026-08")
      )
    ).toBe(false);
    expect(
      isSuppressedInWindow(
        { kind: "indefinite" },
        getScopeDateRange("2026-08")
      )
    ).toBe(true);
  });

  it("reports suppression on a specific date", () => {
    expect(
      isSuppressedOnDate({ kind: "until", through: "2026-08-20" }, "2026-08-20")
    ).toBe(true);
    expect(
      isSuppressedOnDate({ kind: "until", through: "2026-08-20" }, "2026-08-21")
    ).toBe(false);
    expect(isSuppressedOnDate({ kind: "indefinite" }, "2026-08-21")).toBe(true);
  });

  it("computes resume date only for finite suppression", () => {
    expect(
      getLinkResumeDate({ kind: "until", through: "2026-08-31" })
    ).toBe("2026-09-01");
    expect(getLinkResumeDate({ kind: "none" })).toBeNull();
    expect(getLinkResumeDate({ kind: "indefinite" })).toBeNull();
  });
});
