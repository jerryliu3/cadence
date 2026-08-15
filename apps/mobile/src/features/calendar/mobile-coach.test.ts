import { describe, expect, it, vi } from "vitest";
import {
  applyMobileCoachPatches,
  buildMobileCoachRequest,
} from "./mobile-coach";
import {
  createEmptyMobilePlannerDraft,
  type MobilePlannerDraftState,
} from "./mobile-planner-draft";
import type { MobilePlannerContext } from "./planner-context-loader";

const workUnits = [
  {
    originalGoalId: "goal-a",
    unitKey: "total:1",
    scheduledDate: "2026-08-20",
    label: "Run",
    classification: "scheduled",
    creditState: "uncredited",
  },
  {
    originalGoalId: "goal-b",
    unitKey: "total:1",
    scheduledDate: "2026-08-21",
    label: "Lift",
    classification: "scheduled",
    creditState: "uncredited",
  },
];

const preview = {
  generationInputHash: "a".repeat(64),
  eligibilityMode: "overlap_v1" as const,
  preserveExistingAssignments: true,
  solver: {
    placementStatus: "complete" as const,
    searchStatus: "all_units_placed" as const,
    capacityStatus: "unverified" as const,
    publishable: true,
    confirmationRequired: false,
    issueCodes: [],
    invalidGoalIds: [],
  },
  workUnits,
};

const context: MobilePlannerContext = {
  schemaVersion: "1",
  scopeMonth: "2026-08",
  asOfDate: "2026-08-14",
  timezone: "America/New_York",
  goalTitles: { "goal-a": "Running", "goal-b": "Lifting" },
  capabilities: { crossMonthMovesEnabled: true },
  preview,
  activePlan: {
    plan: { id: "plan-1", version: 1, status: "active" },
    goals: [],
    items: [],
  },
  revisions: {
    canonicalRevision: 1,
    executionRevision: 1,
    scheduleDigest: "b".repeat(64),
  },
  preferences: {
    timezone: "America/New_York",
    timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
    policyRevision: 1,
    defaultPolicy: {
      schemaVersion: "1",
      timezone: "America/New_York",
      timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
      restWeekdays: [],
      blackoutRanges: [],
    },
  },
  staleness: { stale: false, reasons: [] },
  unplaceableGoals: [],
};

describe("buildMobileCoachRequest", () => {
  it("uses the active draft window and activity-ranked focus goals", () => {
    const draft: MobilePlannerDraftState = {
      ...createEmptyMobilePlannerDraft(),
      preview,
      previewWindow: { start: "2026-08-01", end: "2026-09-30" },
      dirty: true,
    };

    const request = buildMobileCoachRequest({
      context,
      currentMonth: "2026-08",
      state: draft,
      messages: [{ role: "user", content: "Move my run" }],
    });

    expect(request).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      focusGoalIds: ["goal-b", "goal-a"],
      messages: [{ role: "user", content: "Move my run" }],
    });
    expect(request.deterministicSummary).toContain(
      "window=2026-08-01..2026-09-30"
    );
  });
});

describe("applyMobileCoachPatches", () => {
  it("pins resolved moves, converts policy replan changes, and stabilizes the draft", async () => {
    const replanPreview = {
      ...preview,
      workUnits: [
        workUnits[0],
        { ...workUnits[1], scheduledDate: "2026-08-28" },
      ],
    };
    const postJson = vi
      .fn()
      .mockResolvedValueOnce({ preview: replanPreview })
      .mockResolvedValueOnce({ preview });
    const putJson = vi.fn(async () => ({}));

    const result = await applyMobileCoachPatches({
      client: { postJson, putJson },
      context,
      currentMonth: "2026-08",
      state: createEmptyMobilePlannerDraft(),
      patches: [
        { kind: "set_rest_weekdays", restWeekdays: [0] },
        {
          kind: "move_session",
          goalId: "goal-a",
          unitKey: "total:1",
          scheduledDate: "2026-09-02",
        },
      ],
    });

    expect(postJson).toHaveBeenNthCalledWith(
      1,
      "/api/planner/context",
      expect.objectContaining({
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        solveIntent: "replan",
        draftCommands: [
          expect.objectContaining({
            goalId: "goal-a",
            scheduledDate: "2026-09-02",
          }),
        ],
      })
    );
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      "/api/planner/context",
      expect.objectContaining({
        solveIntent: "stable",
        draftCommands: expect.arrayContaining([
          expect.objectContaining({
            goalId: "goal-a",
            scheduledDate: "2026-09-02",
          }),
          expect.objectContaining({
            goalId: "goal-b",
            sourceDate: "2026-08-21",
            scheduledDate: "2026-08-28",
          }),
        ]),
      })
    );
    expect(putJson).toHaveBeenCalledWith("/api/planner/context", {
      timezone: "America/New_York",
      defaultPolicy: expect.objectContaining({ restWeekdays: [0] }),
    });
    expect(result.state.dirty).toBe(true);
    expect(result.queuedSessionMoves).toBe(1);
    expect(result.policyReplanMoves).toBe(1);
  });
});
