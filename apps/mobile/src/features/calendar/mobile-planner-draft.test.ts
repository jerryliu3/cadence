import { describe, expect, it, vi } from "vitest";
import {
  createEmptyMobilePlannerDraft,
  previewMobilePlannerDraft,
  publishMobilePlannerDraft,
  upsertMobilePlannerDraftMove,
} from "./mobile-planner-draft";
import type {
  MobilePlannerContext,
  MobilePlannerWorkUnit,
} from "./planner-context-loader";

const unit: MobilePlannerWorkUnit = {
  originalGoalId: "22222222-2222-4222-8222-222222222222",
  unitKey: "total:1",
  scheduledDate: "2026-08-31",
  label: "Run",
  classification: "scheduled",
  creditState: "uncredited",
  placementWindow: { start: "2026-08-01", end: "2026-09-30" },
};

const preview = {
  generationInputHash: "a".repeat(64),
  eligibilityMode: "overlap_v1" as const,
  preserveExistingAssignments: true,
  solver: {
    publishable: true,
    confirmationRequired: false,
    issueCodes: [],
  },
  workUnits: [unit],
};

const context: MobilePlannerContext = {
  scopeMonth: "2026-08",
  asOfDate: "2026-08-14",
  timezone: "America/New_York",
  goalTitles: { [unit.originalGoalId]: "Run" },
  preview,
  activePlan: {
    plan: { id: "plan-1", version: 1, status: "active" },
    items: [],
  },
  revisions: { scheduleDigest: "b".repeat(64) },
  preferences: { defaultPolicy: { schemaVersion: "1" } },
  unplaceableGoals: [],
};

describe("mobile planner draft", () => {
  it("replaces repeated moves while preserving the original source date", () => {
    const first = upsertMobilePlannerDraftMove({
      state: createEmptyMobilePlannerDraft(),
      unit,
      scheduledDate: "2026-09-05",
    });
    const second = upsertMobilePlannerDraftMove({
      state: first,
      unit: { ...unit, scheduledDate: "2026-09-05" },
      scheduledDate: "2026-09-12",
    });

    expect(second.commands).toHaveLength(1);
    expect(second.commands[0]).toMatchObject({
      sourceDate: "2026-08-31",
      scheduledDate: "2026-09-12",
      sequence: 0,
    });
    expect(second.commands[0]?.id).toBe(first.commands[0]?.id);
  });

  it("previews the accumulated commands against their covering window", async () => {
    const postJson = vi.fn(async () => ({ preview }));
    const state = upsertMobilePlannerDraftMove({
      state: createEmptyMobilePlannerDraft(),
      unit,
      scheduledDate: "2026-09-05",
    });

    const next = await previewMobilePlannerDraft({
      client: { postJson },
      context,
      currentMonth: "2026-08",
      state,
    });

    expect(postJson).toHaveBeenCalledWith("/api/planner/context", {
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      timezone: "America/New_York",
      policy: context.preferences?.defaultPolicy,
      source: "update",
      solveIntent: "stable",
      draftCommands: state.commands,
    });
    expect(next.preview).toBe(preview);
    expect(next.previewWindow).toEqual({
      start: "2026-08-01",
      end: "2026-09-30",
    });
    expect(next.dirty).toBe(true);
  });

  it("publishes the same window, preview hash, and draft commands", async () => {
    const postJson = vi.fn(async () => ({ replayed: false }));
    const state = await previewMobilePlannerDraft({
      client: { postJson: vi.fn(async () => ({ preview })) },
      context,
      currentMonth: "2026-08",
      state: upsertMobilePlannerDraftMove({
        state: createEmptyMobilePlannerDraft(),
        unit,
        scheduledDate: "2026-09-05",
      }),
    });

    await publishMobilePlannerDraft({
      client: { postJson },
      context,
      state,
    });

    expect(postJson).toHaveBeenCalledWith("/api/planner/save", {
      expectedDigest: "b".repeat(64),
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      previewHash: "a".repeat(64),
      eligibilityMode: "overlap_v1",
      confirmationHash: null,
      policy: context.preferences?.defaultPolicy,
      preserveExistingAssignments: true,
      draftCommands: state.commands,
    });
  });
});
