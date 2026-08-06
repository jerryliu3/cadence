import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import type { UsePlannerCoachArgs } from "@/features/planner/coach/coach-types";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import type { PlannerPolicy } from "@/lib/planner/policy";

const listPlannerCoachConversationsMock = vi.fn();
const requestPlannerCoachReplyMock = vi.fn();
const restorePlannerCoachConversationMock = vi.fn();
const savePlannerCoachConversationMock = vi.fn();
const loadCoachSessionMock = vi.fn();
const saveCoachSessionMock = vi.fn();
const applyCoachPolicyPatchesMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/features/planner/coach/coach-client", () => ({
  listPlannerCoachConversations: (...args: unknown[]) =>
    listPlannerCoachConversationsMock(...args),
  requestPlannerCoachReply: (...args: unknown[]) =>
    requestPlannerCoachReplyMock(...args),
  restorePlannerCoachConversation: (...args: unknown[]) =>
    restorePlannerCoachConversationMock(...args),
  savePlannerCoachConversation: (...args: unknown[]) =>
    savePlannerCoachConversationMock(...args),
}));

vi.mock("@/features/planner/coach-session", () => ({
  buildCoachSessionKey: (scopeMonth: string, timezone: string) =>
    `planner-coach-session:v1:${scopeMonth}:${timezone}`,
  COACH_SESSION_MAX_MESSAGES: 20,
  loadCoachSession: (...args: unknown[]) => loadCoachSessionMock(...args),
  saveCoachSession: (...args: unknown[]) => saveCoachSessionMock(...args),
}));

vi.mock("@/features/planner/coach-context", () => ({
  buildCoachDeterministicSummary: () => "deterministic-summary",
}));

vi.mock("@/features/planner/coach-policy", () => ({
  applyCoachPolicyPatches: (...args: unknown[]) =>
    applyCoachPolicyPatchesMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildPolicy(overrides: Partial<PlannerPolicy> = {}): PlannerPolicy {
  return {
    schemaVersion: "1",
    timezone: "UTC",
    timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
    restWeekdays: [],
    blackoutRanges: [],
    goalAllowedWeekdays: {},
    datePreferences: [],
    spacingStrategy: "even",
    goalSpacingStrategies: {},
    dailyCadenceRestExemption: true,
    ...overrides,
  };
}

function buildWorkUnit(overrides: Partial<PlannerWorkUnit> = {}): PlannerWorkUnit {
  return {
    originalGoalId: "goal-1",
    unitKey: "unit-1",
    label: "Easy run",
    scheduledDate: "2026-08-01",
    classification: "planned",
    creditState: "uncredited",
    ...overrides,
  };
}

function buildEntry(overrides: Partial<PlannerDayDetailEntry> = {}): PlannerDayDetailEntry {
  return {
    key: "goal-1:unit-1",
    originalGoalId: "goal-1",
    goalTitle: "Running",
    unitKey: "unit-1",
    label: "Easy run",
    classification: "planned",
    creditState: "uncredited",
    activeGoal: null,
    activeItem: null,
    draftDiffKind: null,
    draftDiffFromDate: null,
    draftDiffToDate: null,
    draftGhost: false,
    ...overrides,
  };
}

function buildContext(
  overrides: Partial<PlannerContextPayload> = {}
): PlannerContextPayload {
  const base: PlannerContextPayload = {
    schemaVersion: "1",
    scopeMonth: "2026-08",
    asOfDate: "2026-08-06",
    timezone: "UTC",
    goalTitles: {
      "goal-1": "Running",
    },
    preferences: {
      timezone: "UTC",
      timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
      policyRevision: 1,
      defaultPolicy: buildPolicy(),
    },
    capabilities: {
      plannerRead: true,
      plannerGeneration: true,
      plannerPlanWrites: true,
      targetedExactCompletion: true,
      coachAi: true,
      overlap: false,
    },
    activePlan: null,
    preview: {
      eligibilityMode: "end_month_v1",
      generationInputHash: "hash",
      solver: {
        placementStatus: "complete",
        searchStatus: "all_units_placed",
        capacityStatus: "unverified",
        issueCodes: [],
        invalidGoalIds: [],
        publishable: true,
        confirmationRequired: false,
      },
      workUnits: [buildWorkUnit()],
    },
    revisions: {
      canonicalRevision: 1,
      executionRevision: 1,
    },
    staleness: {
      stale: false,
      reasons: [],
    },
  };
  return {
    ...base,
    ...overrides,
    capabilities: {
      ...base.capabilities,
      ...(overrides.capabilities ?? {}),
    },
    preferences: overrides.preferences === undefined ? base.preferences : overrides.preferences,
    preview: overrides.preview === undefined ? base.preview : overrides.preview,
    revisions: {
      ...base.revisions,
      ...(overrides.revisions ?? {}),
    },
    staleness: overrides.staleness ?? base.staleness,
  };
}

function buildArgs(overrides: Partial<UsePlannerCoachArgs> = {}): UsePlannerCoachArgs {
  return {
    activeTab: "today",
    context: null,
    entriesByDate: new Map(),
    effectivePreview: null,
    effectiveDraftPolicy: null,
    hasDraftSession: false,
    refreshDraftPreview: vi.fn().mockResolvedValue(null),
    applyDraftPolicy: vi.fn(),
    getNonPublishablePreviewMessage: vi.fn().mockReturnValue("blocked"),
    ...overrides,
  };
}

describe("usePlannerCoach", () => {
  beforeEach(() => {
    listPlannerCoachConversationsMock.mockReset().mockResolvedValue([]);
    requestPlannerCoachReplyMock.mockReset();
    restorePlannerCoachConversationMock.mockReset();
    savePlannerCoachConversationMock.mockReset();
    loadCoachSessionMock.mockReset().mockReturnValue([]);
    saveCoachSessionMock.mockReset();
    applyCoachPolicyPatchesMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("reports coach unavailable without context", () => {
    const { result } = renderHook(() => usePlannerCoach(buildArgs()));
    expect(result.current.state.canUseCoach).toBe(false);
  });

  it("sends coach message and stores response metadata", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "review",
      reply: "Try three easy runs this week.",
      proposal: {
        policyPatches: [
          {
            kind: "set_spacing_strategy",
            spacingStrategy: "even",
          },
        ],
        unresolvedQuestions: ["Which day should be your long run?"],
      },
      recommendations: [{ text: "Keep one full rest day." }],
      warnings: ["Watch cumulative fatigue."],
    });
    const context = buildContext();
    const entriesByDate = new Map<string, PlannerDayDetailEntry[]>([
      ["2026-08-01", [buildEntry()]],
    ]);
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate,
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => {
      expect(loadCoachSessionMock).toHaveBeenCalledWith("2026-08", "UTC");
    });

    act(() => {
      result.current.actions.setCoachInput("Plan my running week");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    expect(requestPlannerCoachReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeMonth: "2026-08",
        focusGoalIds: ["goal-1"],
      })
    );
    expect(result.current.state.coachMessages).toHaveLength(2);
    expect(result.current.state.coachMessages.at(-1)?.content).toContain("three easy runs");
    expect(result.current.state.coachWarnings).toEqual(["Watch cumulative fatigue."]);
    expect(result.current.state.coachRecommendations).toEqual([
      "Keep one full rest day.",
    ]);
    expect(saveCoachSessionMock).toHaveBeenCalled();
  });

  it("applies coach proposal and computes assignment change summary", async () => {
    const context = buildContext();
    const nextPolicy = buildPolicy({ spacingStrategy: "flexible" });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Applying spacing strategy.",
      proposal: {
        policyPatches: [
          {
            kind: "set_spacing_strategy",
            spacingStrategy: "flexible",
          },
        ],
        unresolvedQuestions: [],
      },
      recommendations: [],
      warnings: [],
    });
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: nextPolicy,
      appliedPatchCount: 1,
      ignoredPatchCount: 0,
      noOpPatchCount: 0,
      outOfScopePatchCount: 0,
      unsupportedPatchCount: 0,
    });
    const refreshDraftPreviewMock = vi.fn().mockResolvedValue({
      ...context.preview!,
      workUnits: [
        buildWorkUnit({
          scheduledDate: "2026-08-03",
        }),
      ],
    });
    const applyDraftPolicyMock = vi.fn();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          refreshDraftPreview: refreshDraftPreviewMock,
          applyDraftPolicy: applyDraftPolicyMock,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("Please optimize spacing");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachPendingPatches).toHaveLength(1);
    });
    await act(async () => {
      await result.current.actions.applyCoachProposal();
    });

    expect(applyCoachPolicyPatchesMock).toHaveBeenCalled();
    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(nextPolicy);
    expect(applyDraftPolicyMock).toHaveBeenCalledWith("2026-08", nextPolicy);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("session change")
    );
  });

  it("saves and restores persistent coach conversations", async () => {
    const context = buildContext();
    loadCoachSessionMock.mockReturnValue([
      {
        role: "user",
        content: "Initial saved message",
        createdAt: 123,
      },
    ]);
    savePlannerCoachConversationMock.mockResolvedValue({
      id: "conversation-1",
      scopeMonth: "2026-08",
      timezone: "UTC",
      title: "Saved coach thread",
      previewText: "Initial saved message",
      messageCount: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    restorePlannerCoachConversationMock.mockResolvedValue({
      schemaVersion: "1",
      conversation: {
        id: "conversation-1",
        scopeMonth: "2026-08",
        timezone: "UTC",
        title: "Saved coach thread",
        previewText: "Initial saved message",
        messageCount: 2,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      messages: [
        { role: "user", content: "Initial saved message", createdAt: 123 },
        { role: "assistant", content: "Restored assistant reply", createdAt: 456 },
      ],
    });

    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map(),
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.actions.saveCoachConversation();
    });
    expect(savePlannerCoachConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeMonth: "2026-08",
        timezone: "UTC",
      })
    );
    expect(result.current.state.savedCoachConversations[0]?.id).toBe("conversation-1");

    await act(async () => {
      await result.current.actions.restoreSavedCoachConversation("conversation-1");
    });
    expect(restorePlannerCoachConversationMock).toHaveBeenCalledWith("conversation-1");
    expect(result.current.state.coachMessages.at(-1)?.content).toBe(
      "Restored assistant reply"
    );
    expect(saveCoachSessionMock).toHaveBeenCalledWith(
      "2026-08",
      "UTC",
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "Restored assistant reply" }),
      ])
    );
  });
});
