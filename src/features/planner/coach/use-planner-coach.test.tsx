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
const persistPlannerDefaultPolicyMock = vi.fn();
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
  persistPlannerDefaultPolicy: (...args: unknown[]) =>
    persistPlannerDefaultPolicyMock(...args),
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
      calendarEnabled: true,
    },
    activePlan: null,
    preview: {
      eligibilityMode: "overlap_v1",
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
    persistPlannerDefaultPolicyMock.mockReset().mockResolvedValue(null);
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

  it("suppresses toast when saved conversation listing is temporarily unavailable", async () => {
    listPlannerCoachConversationsMock.mockRejectedValue(
      new Error("Saved coach conversations are temporarily unavailable.")
    );
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => {
      expect(listPlannerCoachConversationsMock).toHaveBeenCalledWith({
        scopeMonth: "2026-08",
        limit: 20,
      });
    });
    await waitFor(() => {
      expect(result.current.state.coachConversationsLoading).toBe(false);
    });

    expect(result.current.state.savedCoachConversations).toEqual([]);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("shows toast when saved conversation listing fails unexpectedly", async () => {
    listPlannerCoachConversationsMock.mockRejectedValue(
      new Error("Saved conversations endpoint failed.")
    );
    const context = buildContext();
    renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Saved conversations endpoint failed."
      );
    });
  });

  it("sends coach message and stores response metadata", async () => {
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 1,
      outOfScopePatchCount: 0,
      unsupportedPatchCount: 0,
    });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "review",
      reply: "Try three easy runs this week.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [2, 4],
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
    expect(result.current.state.coachMessages.at(-1)?.content).toContain(
      "Recommended next actions:"
    );
    expect(result.current.state.coachMessages.at(-1)?.content).toContain(
      "Draft updates proposed:"
    );
    expect(result.current.state.coachWarnings).toEqual(["Watch cumulative fatigue."]);
    expect(result.current.state.coachRecommendations).toEqual([
      "Keep one full rest day.",
    ]);
    const proposal = result.current.state.coachMessages.at(-1)?.proposal;
    expect(proposal).toMatchObject({
      schemaVersion: "1",
      applyStatus: "not_applied",
      policyPatches: [
        {
          kind: "set_rest_weekdays",
          restWeekdays: [2, 4],
        },
      ],
    });
    expect(proposal?.patchSignature).toHaveLength(64);
    expect(proposal?.baselineSnapshotToken.startsWith("policy:")).toBe(true);
    expect(applyCoachPolicyPatchesMock).not.toHaveBeenCalled();
    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(saveCoachSessionMock).toHaveBeenCalled();
  });

  it("marks proposal manually applied when manual apply is a no-op", async () => {
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 1,
      outOfScopePatchCount: 0,
      unsupportedPatchCount: 0,
    });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "review",
      reply: "Try three easy runs this week.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [2, 4],
          },
        ],
        unresolvedQuestions: [],
      },
      recommendations: [],
      warnings: [],
    });
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
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
    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    expect(proposalIndex).toBeGreaterThanOrEqual(0);

    await act(async () => {
      await result.current.actions.applyCoachProposal(proposalIndex);
    });

    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("manually_applied");
  });

  it("keeps proposal pending manual apply after coach response", async () => {
    const context = buildContext();
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Applying spacing strategy.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [0, 6],
          },
        ],
        unresolvedQuestions: [],
      },
      recommendations: [],
      warnings: [],
    });
    const refreshDraftPreviewMock = vi.fn();
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

    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(refreshDraftPreviewMock).not.toHaveBeenCalled();
    expect(applyDraftPolicyMock).not.toHaveBeenCalled();
    expect(result.current.state.coachMessages.at(-1)?.proposal?.applyStatus).toBe(
      "not_applied"
    );
  });

  it("keeps the latest proposal available across later non-proposal replies", async () => {
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 1,
      outOfScopePatchCount: 0,
      unsupportedPatchCount: 0,
    });
    requestPlannerCoachReplyMock
      .mockResolvedValueOnce({
        schemaVersion: "1",
        phase: "ready",
        reply: "I suggested weekday updates.",
        proposal: {
          policyPatches: [
            {
              kind: "set_rest_weekdays",
              restWeekdays: [2, 4],
            },
          ],
          unresolvedQuestions: [],
        },
        recommendations: [],
        warnings: [],
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        phase: "review",
        reply: "Here is extra context with no new draft edits.",
        proposal: {
          policyPatches: [],
          unresolvedQuestions: [],
        },
        recommendations: [],
        warnings: [],
      });

    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("First request");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    const firstProposalCount = result.current.state.coachMessages.filter(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    ).length;
    expect(firstProposalCount).toBe(1);

    act(() => {
      result.current.actions.setCoachInput("Second request");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    const proposalMessages = result.current.state.coachMessages.filter(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    expect(proposalMessages).toHaveLength(1);
    expect(proposalMessages[0]?.proposal?.applyStatus).toBe("not_applied");
  });

  it("applies coach proposal and computes assignment change summary", async () => {
    const context = buildContext();
    const nextPolicy = buildPolicy({ restWeekdays: [2, 4] });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Applying rest day guidance.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [2, 4],
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
    const hookArgs: UsePlannerCoachArgs = buildArgs({
      activeTab: "calendar",
      context,
      entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
      effectivePreview: context.preview,
      refreshDraftPreview: refreshDraftPreviewMock,
      applyDraftPolicy: applyDraftPolicyMock,
    });
    const { result, rerender } = renderHook(() => usePlannerCoach(hookArgs));

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("Please optimize spacing");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    expect(proposalIndex).toBeGreaterThanOrEqual(0);
    await waitFor(() => {
      expect(
        result.current.state.coachMessages[proposalIndex]?.proposal?.policyPatches
          .length
      ).toBe(1);
    });
    await act(async () => {
      await result.current.actions.applyCoachProposal(proposalIndex);
    });

    expect(applyCoachPolicyPatchesMock).toHaveBeenCalled();
    expect(persistPlannerDefaultPolicyMock).toHaveBeenCalledWith({
      timezone: "UTC",
      defaultPolicy: nextPolicy,
    });
    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(nextPolicy);
    expect(applyDraftPolicyMock).toHaveBeenCalledWith("2026-08", nextPolicy);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("session change")
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Saved as your default planner policy")
    );
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("manually_applied");

    hookArgs.hasDraftSession = true;
    hookArgs.effectiveDraftPolicy = nextPolicy;
    rerender();

    await act(async () => {
      await result.current.actions.undoCoachProposal(proposalIndex);
    });

    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        restWeekdays: [],
        blackoutRanges: [],
      })
    );
    expect(persistPlannerDefaultPolicyMock).toHaveBeenLastCalledWith({
      timezone: "UTC",
      defaultPolicy: expect.objectContaining({
        restWeekdays: [],
        blackoutRanges: [],
      }),
    });
    expect(applyDraftPolicyMock).toHaveBeenLastCalledWith(
      "2026-08",
      expect.objectContaining({
        restWeekdays: [],
        blackoutRanges: [],
      })
    );
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("undone");
  });

  it("blocks undo when newer draft policy changes exist", async () => {
    const baselinePolicy = buildPolicy({ restWeekdays: [1] });
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "Try even spacing with this adjustment.",
        createdAt: 123,
        proposal: {
          schemaVersion: "1",
          applyStatus: "manually_applied",
          patchSignature:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          baselineSnapshotToken:
            "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          baselinePolicy,
          policyPatches: [
            {
              kind: "set_rest_weekdays",
              restWeekdays: [2],
            },
          ],
          unresolvedQuestions: [],
        },
      },
    ]);
    applyCoachPolicyPatchesMock.mockImplementation(
      ({
        policy,
        patches,
      }: {
        policy: PlannerPolicy;
        patches: Array<{ kind: string; restWeekdays?: number[] }>;
      }) => {
        const nextPolicy = structuredClone(policy);
        for (const patch of patches) {
          if (patch.kind === "set_rest_weekdays" && patch.restWeekdays !== undefined) {
            nextPolicy.restWeekdays = [...patch.restWeekdays];
          }
        }
        return {
          policy: nextPolicy,
          appliedPatchCount: 1,
          ignoredPatchCount: 0,
          noOpPatchCount: 0,
          outOfScopePatchCount: 0,
          unsupportedPatchCount: 0,
        };
      }
    );

    const context = buildContext({
      preferences: {
        timezone: "UTC",
        timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
        policyRevision: 1,
        defaultPolicy: baselinePolicy,
      },
    });
    const refreshDraftPreviewMock = vi.fn().mockResolvedValue(context.preview);
    const applyDraftPolicyMock = vi.fn();

    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          hasDraftSession: true,
          effectiveDraftPolicy: buildPolicy({ restWeekdays: [4] }),
          refreshDraftPreview: refreshDraftPreviewMock,
          applyDraftPolicy: applyDraftPolicyMock,
        })
      )
    );

    await waitFor(() => {
      expect(result.current.state.coachMessages).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.undoCoachProposal(0);
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Undo is blocked because newer draft policy changes were applied after this proposal. Undo newer proposals first or discard draft changes."
    );
    expect(refreshDraftPreviewMock).not.toHaveBeenCalled();
    expect(applyDraftPolicyMock).not.toHaveBeenCalled();
    expect(result.current.state.coachMessages[0]?.proposal?.applyStatus).toBe(
      "manually_applied"
    );
  });

  it("validates undo preview before persisting manual default restoration", async () => {
    const baselinePolicy = buildPolicy({ restWeekdays: [1] });
    const appliedPolicy = buildPolicy({ restWeekdays: [2] });
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "Try front-loaded spacing.",
        createdAt: 123,
        proposal: {
          schemaVersion: "1",
          applyStatus: "manually_applied",
          patchSignature:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          baselineSnapshotToken:
            "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          baselinePolicy,
          policyPatches: [
            {
              kind: "set_rest_weekdays",
              restWeekdays: [2],
            },
          ],
          unresolvedQuestions: [],
        },
      },
    ]);
    applyCoachPolicyPatchesMock.mockImplementation(
      ({
        policy,
        patches,
      }: {
        policy: PlannerPolicy;
        patches: Array<{ kind: string; restWeekdays?: number[] }>;
      }) => {
        const nextPolicy = structuredClone(policy);
        for (const patch of patches) {
          if (patch.kind === "set_rest_weekdays" && patch.restWeekdays !== undefined) {
            nextPolicy.restWeekdays = [...patch.restWeekdays];
          }
        }
        return {
          policy: nextPolicy,
          appliedPatchCount: 1,
          ignoredPatchCount: 0,
          noOpPatchCount: 0,
          outOfScopePatchCount: 0,
          unsupportedPatchCount: 0,
        };
      }
    );
    const context = buildContext({
      preferences: {
        timezone: "UTC",
        timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
        policyRevision: 1,
        defaultPolicy: baselinePolicy,
      },
    });
    const refreshDraftPreviewMock = vi
      .fn()
      .mockRejectedValue(new Error("Undo preview failed."));
    const applyDraftPolicyMock = vi.fn();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          hasDraftSession: true,
          effectiveDraftPolicy: appliedPolicy,
          refreshDraftPreview: refreshDraftPreviewMock,
          applyDraftPolicy: applyDraftPolicyMock,
        })
      )
    );

    await waitFor(() => {
      expect(result.current.state.coachMessages).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.undoCoachProposal(0);
    });

    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        restWeekdays: baselinePolicy.restWeekdays,
        blackoutRanges: baselinePolicy.blackoutRanges,
      })
    );
    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(applyDraftPolicyMock).not.toHaveBeenCalled();
    expect(result.current.state.coachMessages[0]?.proposal?.applyStatus).toBe(
      "manually_applied"
    );
    expect(toastErrorMock).toHaveBeenCalledWith("Undo preview failed.");
  });

  it("restores draft preview when manual undo persistence fails", async () => {
    const baselinePolicy = buildPolicy({ restWeekdays: [1] });
    const appliedPolicy = buildPolicy({ restWeekdays: [2] });
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "Try front-loaded spacing.",
        createdAt: 123,
        proposal: {
          schemaVersion: "1",
          applyStatus: "manually_applied",
          patchSignature:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          baselineSnapshotToken:
            "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          baselinePolicy,
          policyPatches: [
            {
              kind: "set_rest_weekdays",
              restWeekdays: [2],
            },
          ],
          unresolvedQuestions: [],
        },
      },
    ]);
    applyCoachPolicyPatchesMock.mockImplementation(
      ({
        policy,
        patches,
      }: {
        policy: PlannerPolicy;
        patches: Array<{ kind: string; restWeekdays?: number[] }>;
      }) => {
        const nextPolicy = structuredClone(policy);
        for (const patch of patches) {
          if (patch.kind === "set_rest_weekdays" && patch.restWeekdays !== undefined) {
            nextPolicy.restWeekdays = [...patch.restWeekdays];
          }
        }
        return {
          policy: nextPolicy,
          appliedPatchCount: 1,
          ignoredPatchCount: 0,
          noOpPatchCount: 0,
          outOfScopePatchCount: 0,
          unsupportedPatchCount: 0,
        };
      }
    );
    persistPlannerDefaultPolicyMock.mockRejectedValue(
      new Error("Planner preferences could not be updated.")
    );
    const context = buildContext({
      preferences: {
        timezone: "UTC",
        timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
        policyRevision: 1,
        defaultPolicy: baselinePolicy,
      },
    });
    const refreshDraftPreviewMock = vi
      .fn()
      .mockResolvedValueOnce(context.preview)
      .mockResolvedValueOnce(context.preview);
    const applyDraftPolicyMock = vi.fn();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          hasDraftSession: true,
          effectiveDraftPolicy: appliedPolicy,
          refreshDraftPreview: refreshDraftPreviewMock,
          applyDraftPolicy: applyDraftPolicyMock,
        })
      )
    );

    await waitFor(() => {
      expect(result.current.state.coachMessages).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.undoCoachProposal(0);
    });

    expect(refreshDraftPreviewMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        restWeekdays: baselinePolicy.restWeekdays,
        blackoutRanges: baselinePolicy.blackoutRanges,
      })
    );
    expect(refreshDraftPreviewMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        restWeekdays: appliedPolicy.restWeekdays,
        blackoutRanges: appliedPolicy.blackoutRanges,
      })
    );
    expect(persistPlannerDefaultPolicyMock).toHaveBeenCalledWith({
      timezone: "UTC",
      defaultPolicy: expect.objectContaining({
        restWeekdays: baselinePolicy.restWeekdays,
        blackoutRanges: baselinePolicy.blackoutRanges,
      }),
    });
    expect(applyDraftPolicyMock).toHaveBeenCalledWith(
      "2026-08",
      expect.objectContaining({
        restWeekdays: appliedPolicy.restWeekdays,
        blackoutRanges: appliedPolicy.blackoutRanges,
      })
    );
    expect(result.current.state.coachMessages[0]?.proposal?.applyStatus).toBe(
      "manually_applied"
    );
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Planner preferences could not be updated."
    );
  });

  it("keeps proposal unapplied when durable preference write fails", async () => {
    const context = buildContext();
    const nextPolicy = buildPolicy({ restWeekdays: [1, 5] });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Try front-loading this month.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [1, 5],
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
    persistPlannerDefaultPolicyMock.mockRejectedValue(
      new Error("Planner preferences could not be updated.")
    );
    const refreshDraftPreviewMock = vi.fn().mockResolvedValue(context.preview);
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
      result.current.actions.setCoachInput("Apply coach changes");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    expect(proposalIndex).toBeGreaterThanOrEqual(0);

    await act(async () => {
      await result.current.actions.applyCoachProposal(proposalIndex);
    });

    expect(persistPlannerDefaultPolicyMock).toHaveBeenCalledWith({
      timezone: "UTC",
      defaultPolicy: nextPolicy,
    });
    expect(refreshDraftPreviewMock).toHaveBeenCalledTimes(1);
    expect(applyDraftPolicyMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Planner preferences could not be updated."
    );
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("not_applied");
  });

  it("does not persist defaults when manual apply preview refresh fails", async () => {
    const context = buildContext();
    const nextPolicy = buildPolicy({ restWeekdays: [1, 5] });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Try front-loading this month.",
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [1, 5],
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
    const refreshDraftPreviewMock = vi
      .fn()
      .mockRejectedValue(new Error("Preview refresh failed."));
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
      result.current.actions.setCoachInput("Apply coach changes");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    expect(proposalIndex).toBeGreaterThanOrEqual(0);

    await act(async () => {
      await result.current.actions.applyCoachProposal(proposalIndex);
    });

    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(refreshDraftPreviewMock).toHaveBeenCalledTimes(1);
    expect(applyDraftPolicyMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Preview refresh failed.");
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("not_applied");
  });

  it("undoes auto-applied proposal without writing planner defaults", async () => {
    const baselinePolicy = buildPolicy({ restWeekdays: [1] });
    const appliedPolicy = buildPolicy({ restWeekdays: [2] });
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "Try front-loaded spacing.",
        createdAt: 123,
        proposal: {
          schemaVersion: "1",
          applyStatus: "auto_applied",
          patchSignature:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          baselineSnapshotToken:
            "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          baselinePolicy,
          policyPatches: [
            {
              kind: "set_rest_weekdays",
              restWeekdays: [2],
            },
          ],
          unresolvedQuestions: [],
        },
      },
    ]);
    applyCoachPolicyPatchesMock.mockImplementation(
      ({
        policy,
        patches,
      }: {
        policy: PlannerPolicy;
        patches: Array<{ kind: string; restWeekdays?: number[] }>;
      }) => {
        const nextPolicy = structuredClone(policy);
        for (const patch of patches) {
          if (patch.kind === "set_rest_weekdays" && patch.restWeekdays !== undefined) {
            nextPolicy.restWeekdays = [...patch.restWeekdays];
          }
        }
        return {
          policy: nextPolicy,
          appliedPatchCount: 1,
          ignoredPatchCount: 0,
          noOpPatchCount: 0,
          outOfScopePatchCount: 0,
          unsupportedPatchCount: 0,
        };
      }
    );
    const context = buildContext({
      preferences: {
        timezone: "UTC",
        timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
        policyRevision: 1,
        defaultPolicy: baselinePolicy,
      },
    });
    const refreshDraftPreviewMock = vi.fn().mockResolvedValue(context.preview);
    const applyDraftPolicyMock = vi.fn();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          hasDraftSession: true,
          effectiveDraftPolicy: appliedPolicy,
          refreshDraftPreview: refreshDraftPreviewMock,
          applyDraftPolicy: applyDraftPolicyMock,
        })
      )
    );

    await waitFor(() => {
      expect(result.current.state.coachMessages).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.undoCoachProposal(0);
    });

    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        restWeekdays: baselinePolicy.restWeekdays,
        blackoutRanges: baselinePolicy.blackoutRanges,
      })
    );
    expect(applyDraftPolicyMock).toHaveBeenCalledWith(
      "2026-08",
      expect.objectContaining({
        restWeekdays: baselinePolicy.restWeekdays,
        blackoutRanges: baselinePolicy.blackoutRanges,
      })
    );
    expect(result.current.state.coachMessages[0]?.proposal?.applyStatus).toBe("undone");
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Coach draft preview changes were undone."
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
        {
          role: "assistant",
          content: "Restored assistant reply",
          createdAt: 456,
          proposal: {
            schemaVersion: "1",
            applyStatus: "not_applied",
            patchSignature:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            baselineSnapshotToken:
              "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            baselinePolicy: context.preferences!.defaultPolicy,
            policyPatches: [
              {
                kind: "set_rest_weekdays",
                restWeekdays: [2, 4],
              },
            ],
            unresolvedQuestions: [],
          },
        },
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
