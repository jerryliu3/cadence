import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import type { UsePlannerCoachArgs } from "@/features/planner/coach/coach-types";
import { isCoachPolicyProposal } from "@/features/planner/coach/coach-message-state";
import { buildBulkGoalDraftsFromLlmGoals } from "@/features/goals/bulk-goal-drafts";
import type {
  CoachMessage,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  buildPlannerContext,
  buildPlannerDayEntry,
  buildPlannerPolicy,
  buildPlannerWorkUnit,
} from "@/features/planner/test-fixtures";
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
const parseCoachGoalDraftsMock = vi.fn();
const createCoachGoalDraftsMock = vi.fn();

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

vi.mock("@/features/planner/coach/coach-goal-draft-service", () => ({
  parseCoachGoalDrafts: (...args: unknown[]) =>
    parseCoachGoalDraftsMock(...args),
  createCoachGoalDrafts: (...args: unknown[]) =>
    createCoachGoalDraftsMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildWorkUnit(overrides: Partial<PlannerWorkUnit> = {}): PlannerWorkUnit {
  return buildPlannerWorkUnit(overrides);
}

function buildEntry(overrides: Partial<PlannerDayDetailEntry> = {}): PlannerDayDetailEntry {
  return buildPlannerDayEntry(overrides);
}

function buildContext(
  overrides: Partial<PlannerContextPayload> = {}
): PlannerContextPayload {
  return buildPlannerContext({ overrides });
}

function buildPolicy(overrides: Partial<PlannerPolicy> = {}): PlannerPolicy {
  return buildPlannerPolicy(overrides);
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
    applyPolicyReplanMoves: vi
      .fn()
      .mockResolvedValue({ moveCount: 0, movedEntryKeys: [] }),
    queueDraftMoveCommand: vi.fn().mockReturnValue(true),
    clearDraftMoveCommands: vi.fn(),
    applyDraftPolicy: vi.fn(),
    onGoalsCreated: vi.fn().mockResolvedValue(undefined),
    coachWindow: { start: "2026-08-01", end: "2026-08-31" },
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
    parseCoachGoalDraftsMock.mockReset();
    createCoachGoalDraftsMock.mockReset();
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
        startDate: "2026-08-01",
        endDate: "2026-08-31",
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
      "Draft updates already match your current policy:"
    );
    expect(result.current.state.coachWarnings).toEqual(["Watch cumulative fatigue."]);
    expect(result.current.state.coachRecommendations).toEqual([
      "Keep one full rest day.",
    ]);
    const proposal = result.current.state.coachMessages.at(-1)?.proposal;
    expect(proposal).toMatchObject({
      schemaVersion: "1",
      applyStatus: "auto_applied",
      policyPatches: [
        {
          kind: "set_rest_weekdays",
          restWeekdays: [2, 4],
        },
      ],
    });
    if (!proposal || !isCoachPolicyProposal(proposal)) {
      throw new Error("Expected a policy proposal");
    }
    expect(proposal.patchSignature).toHaveLength(64);
    expect(proposal.baselineSnapshotToken.startsWith("policy:")).toBe(true);
    expect(applyCoachPolicyPatchesMock).toHaveBeenCalled();
    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(saveCoachSessionMock).toHaveBeenCalled();
  });

  it("auto-parses actionable goal drafts with the planner timezone", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a four-week running foundation.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt:
          "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
      },
      recommendations: [{ text: "Keep each run conversational." }],
      warnings: [],
    });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        category: "Health",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: 4,
        start_date: "2026-08-17",
        end_date: "2026-09-13",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());
    act(() => {
      result.current.actions.setCoachInput("Build me a four-week 5k plan");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    expect(parseCoachGoalDraftsMock).toHaveBeenCalledWith({
      parserPrompt:
        "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
      timezone: "UTC",
    });
    expect(result.current.state.coachMessages[1]?.proposal).toMatchObject({
      kind: "goal_draft",
      creationStatus: "not_created",
    });
    expect(result.current.state.coachGoalDraftStates[1]?.drafts).toEqual(drafts);
  });

  it("does not auto-parse restored goal draft proposals on mount", async () => {
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "Restored proposal",
        createdAt: 1,
        proposal: {
          schemaVersion: "1",
          kind: "goal_draft",
          proposalId: "35000000-0000-4000-8000-000000000001",
          parserPrompt: "Restored mobility weekly plan.",
          creationStatus: "not_created",
        },
      },
    ]);
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());
    expect(result.current.state.coachMessages).toHaveLength(1);
    expect(parseCoachGoalDraftsMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.actions.generateCoachGoalDrafts(0);
    });

    expect(parseCoachGoalDraftsMock).toHaveBeenCalledWith({
      parserPrompt: "Restored mobility weekly plan.",
      timezone: "UTC",
    });
    expect(result.current.state.coachGoalDraftStates[0]?.status).toBe("ready");
  });

  it("preserves a goal proposal and supports retry after parser quota errors", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a plan.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: "Mobility weekly starting 2026-08-17.",
      },
      recommendations: [],
      warnings: [],
    });
    parseCoachGoalDraftsMock.mockRejectedValueOnce(
      Object.assign(new Error("Daily AI goal parsing limit reached."), {
        code: "quota_exceeded",
      })
    );
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());
    act(() => {
      result.current.actions.setCoachInput("Make a mobility goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]).toMatchObject({
        status: "error",
        errorCode: "quota_exceeded",
      });
    });

    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValueOnce({ drafts, warnings: [] });
    await act(async () => {
      await result.current.actions.generateCoachGoalDrafts(1);
    });

    expect(result.current.state.coachGoalDraftStates[1]).toMatchObject({
      status: "ready",
      drafts,
    });
    expect(parseCoachGoalDraftsMock).toHaveBeenCalledTimes(2);
  });

  it("does not reuse stale draft state when capped messages shift indexes", async () => {
    const oldPrompt = "Old mobility goal weekly.";
    const newPrompt = "New running goal weekly.";
    const cappedMessages: CoachMessage[] = Array.from(
      { length: 19 },
      (_, index) => ({
      role: "user" as const,
      content: `Prior message ${index}`,
      createdAt: index + 1,
      })
    );
    cappedMessages.push({
      role: "assistant" as const,
      content: "Old proposal",
      createdAt: 20,
      proposal: {
        schemaVersion: "1" as const,
        kind: "goal_draft" as const,
        proposalId: "33000000-0000-4000-8000-000000000001",
        parserPrompt: oldPrompt,
        creationStatus: "not_created" as const,
      },
    });
    loadCoachSessionMock.mockReturnValue(cappedMessages);
    parseCoachGoalDraftsMock.mockImplementation(
      ({ parserPrompt }: { parserPrompt: string }) => ({
        drafts: buildBulkGoalDraftsFromLlmGoals([
          {
            title: parserPrompt === oldPrompt ? "Old mobility" : "New running",
            frequency_type: "recurring",
            recurrence_interval: "weekly",
            start_date: "2026-08-17",
          },
        ]),
        warnings: [],
      })
    );
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "New proposal",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: newPrompt,
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
          effectivePreview: context.preview,
        })
      )
    );
    await act(async () => {
      await result.current.actions.generateCoachGoalDrafts(19);
    });
    expect(result.current.state.coachGoalDraftStates[19]?.drafts[0]?.title).toBe(
      "Old mobility"
    );

    act(() => {
      result.current.actions.setCoachInput("Make a new running goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[19]?.drafts[0]?.title).toBe(
        "New running"
      );
    });
    expect(parseCoachGoalDraftsMock).toHaveBeenCalledWith({
      parserPrompt: newPrompt,
      timezone: "UTC",
    });
  });

  it("serializes creation while another proposal is saving and refreshing", async () => {
    loadCoachSessionMock.mockReturnValue([
      {
        role: "assistant",
        content: "First proposal",
        createdAt: 1,
        proposal: {
          schemaVersion: "1",
          kind: "goal_draft",
          proposalId: "34000000-0000-4000-8000-000000000001",
          parserPrompt: "Easy run weekly.",
          creationStatus: "not_created",
        },
      },
      {
        role: "assistant",
        content: "Second proposal",
        createdAt: 2,
        proposal: {
          schemaVersion: "1",
          kind: "goal_draft",
          proposalId: "34000000-0000-4000-8000-000000000002",
          parserPrompt: "Mobility weekly.",
          creationStatus: "not_created",
        },
      },
    ]);
    parseCoachGoalDraftsMock.mockImplementation(
      ({ parserPrompt }: { parserPrompt: string }) => ({
        drafts: buildBulkGoalDraftsFromLlmGoals([
          {
            title: parserPrompt.startsWith("Easy") ? "Easy run" : "Mobility",
            frequency_type: "recurring",
            recurrence_interval: "weekly",
            start_date: "2026-08-17",
          },
        ]),
        warnings: [],
      })
    );
    let resolveCreation:
      | ((value: { createdCount: number }) => void)
      | undefined;
    createCoachGoalDraftsMock.mockReturnValue(
      new Promise<{ createdCount: number }>((resolve) => {
        resolveCreation = resolve;
      })
    );
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
        })
      )
    );
    await act(async () => {
      await result.current.actions.generateCoachGoalDrafts(0);
      await result.current.actions.generateCoachGoalDrafts(1);
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[0]?.status).toBe("ready");
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });

    let firstCreation: Promise<void> | undefined;
    act(() => {
      firstCreation = result.current.actions.createCoachGoalDrafts(0);
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalRefreshStatus).toBe("refreshing");
      expect(createCoachGoalDraftsMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.actions.startNewCoachConversation();
    });
    await act(async () => {
      await result.current.actions.saveCoachConversation();
      await result.current.actions.restoreSavedCoachConversation(
        "conversation-1"
      );
    });
    expect(result.current.state.coachMessages).toHaveLength(2);
    expect(savePlannerCoachConversationMock).not.toHaveBeenCalled();
    expect(restorePlannerCoachConversationMock).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });
    expect(createCoachGoalDraftsMock).toHaveBeenCalledTimes(1);

    resolveCreation?.({ createdCount: 1 });
    await act(async () => {
      await firstCreation;
    });
    expect(result.current.state.coachGoalRefreshStatus).toBe("idle");
  });

  it("creates selected drafts once and refreshes planner context", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a running goal.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: "Easy run weekly starting 2026-08-17.",
      },
      recommendations: [],
      warnings: [],
    });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    createCoachGoalDraftsMock.mockResolvedValue({ createdCount: 1 });
    const onGoalsCreated = vi.fn().mockResolvedValue(undefined);
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
          onGoalsCreated,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());
    act(() => {
      result.current.actions.setCoachInput("Make a running goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });

    expect(createCoachGoalDraftsMock).toHaveBeenCalledWith({ drafts });
    expect(onGoalsCreated).toHaveBeenCalledTimes(1);
    expect(result.current.state.coachMessages[1]?.proposal).toMatchObject({
      kind: "goal_draft",
      creationStatus: "created",
    });
    expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("created");

    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });
    expect(createCoachGoalDraftsMock).toHaveBeenCalledTimes(1);
  });

  it("uses refreshed created-goal work units on the next coach turn", async () => {
    requestPlannerCoachReplyMock
      .mockResolvedValueOnce({
        schemaVersion: "1",
        phase: "ready",
        reply: "I drafted a running goal.",
        proposal: {
          policyPatches: [],
          unresolvedQuestions: [],
          goalDraftPrompt: "Easy run weekly starting 2026-08-17.",
        },
        recommendations: [],
        warnings: [],
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        phase: "ready",
        reply: "I found the new running session.",
        proposal: {
          policyPatches: [],
          unresolvedQuestions: [],
          goalDraftPrompt: null,
        },
        recommendations: [],
        warnings: [],
      });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Easy run",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    createCoachGoalDraftsMock.mockResolvedValue({ createdCount: 1 });
    const context = buildContext();
    let args = buildArgs({
      activeTab: "calendar",
      context,
      effectivePreview: context.preview,
    });
    const { result, rerender } = renderHook(() => usePlannerCoach(args));
    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("Make a running goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });

    const createdGoalId = "22000000-0000-4000-8000-000000000002";
    const refreshedContext = buildContext({
      goalTitles: {
        ...context.goalTitles,
        [createdGoalId]: "Easy run",
      },
      preview: {
        ...context.preview!,
        workUnits: [
          ...context.preview!.workUnits,
          buildWorkUnit({
            originalGoalId: createdGoalId,
            unitKey: "cadence:2026-08-17",
            scheduledDate: "2026-08-17",
          }),
        ],
      },
    });
    args = {
      ...args,
      context: refreshedContext,
      effectivePreview: refreshedContext.preview,
    };
    rerender();

    act(() => {
      result.current.actions.setCoachInput("Move my easy run session");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    expect(requestPlannerCoachReplyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        focusGoalIds: expect.arrayContaining([createdGoalId]),
      })
    );
  });

  it("retries only planner refresh after goals persist successfully", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a mobility goal.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: "Mobility weekly starting 2026-08-17.",
      },
      recommendations: [],
      warnings: [],
    });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    createCoachGoalDraftsMock.mockResolvedValue({ createdCount: 1 });
    const onGoalsCreated = vi
      .fn()
      .mockRejectedValueOnce(new Error("Planner preparation did not complete."))
      .mockResolvedValueOnce(undefined);
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
          onGoalsCreated,
        })
      )
    );
    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("Make a mobility goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });

    expect(result.current.state.coachGoalRefreshStatus).toBe("failed");
    expect(result.current.state.coachMessages[1]?.proposal).toMatchObject({
      kind: "goal_draft",
      creationStatus: "created",
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
      await result.current.actions.retryCoachGoalRefresh();
    });

    expect(createCoachGoalDraftsMock).toHaveBeenCalledTimes(1);
    expect(onGoalsCreated).toHaveBeenCalledTimes(2);
    expect(result.current.state.coachGoalRefreshStatus).toBe("idle");
  });

  it("clears failed refresh state when starting a new conversation", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a mobility goal.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: "Mobility weekly starting 2026-08-17.",
      },
      recommendations: [],
      warnings: [],
    });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    createCoachGoalDraftsMock.mockResolvedValue({ createdCount: 1 });
    const onGoalsCreated = vi
      .fn()
      .mockRejectedValueOnce(new Error("Planner preparation did not complete."));
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
          onGoalsCreated,
        })
      )
    );
    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());

    act(() => {
      result.current.actions.setCoachInput("Make a mobility goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });
    expect(result.current.state.coachGoalRefreshStatus).toBe("failed");
    expect(result.current.state.coachGoalRefreshError).toContain(
      "Planner preparation did not complete"
    );

    act(() => {
      result.current.actions.startNewCoachConversation();
    });

    expect(result.current.state.coachMessages).toEqual([]);
    expect(result.current.state.coachGoalRefreshStatus).toBe("idle");
    expect(result.current.state.coachGoalRefreshError).toBeNull();
  });

  it("keeps drafts visible but blocks creation during pending calendar edits", async () => {
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "I drafted a goal.",
      proposal: {
        policyPatches: [],
        unresolvedQuestions: [],
        goalDraftPrompt: "Mobility weekly starting 2026-08-17.",
      },
      recommendations: [],
      warnings: [],
    });
    const drafts = buildBulkGoalDraftsFromLlmGoals([
      {
        title: "Mobility",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        start_date: "2026-08-17",
      },
    ]);
    parseCoachGoalDraftsMock.mockResolvedValue({ drafts, warnings: [] });
    const context = buildContext();
    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          effectivePreview: context.preview,
          hasDraftSession: true,
        })
      )
    );

    await waitFor(() => expect(loadCoachSessionMock).toHaveBeenCalled());
    act(() => {
      result.current.actions.setCoachInput("Make a mobility goal");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(result.current.state.coachGoalDraftStates[1]?.status).toBe("ready");
    });
    await act(async () => {
      await result.current.actions.createCoachGoalDrafts(1);
    });

    expect(createCoachGoalDraftsMock).not.toHaveBeenCalled();
    expect(result.current.state.coachGoalDraftStates[1]?.drafts).toEqual(drafts);
  });

  it("keeps proposal auto-applied when manual apply is a no-op", async () => {
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 1,
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
    ).toBe("auto_applied");
  });

  it("does not persist defaults during successful auto-apply", async () => {
    const context = buildContext();
    const nextPolicy = buildPolicy({ restWeekdays: [0, 6] });
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: nextPolicy,
      appliedPatchCount: 1,
      ignoredPatchCount: 0,
      noOpPatchCount: 0,
      unsupportedPatchCount: 0,
    });
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

    expect(persistPlannerDefaultPolicyMock).not.toHaveBeenCalled();
    expect(refreshDraftPreviewMock).toHaveBeenCalledWith(nextPolicy);
    expect(applyDraftPolicyMock).toHaveBeenCalledWith(nextPolicy);
    expect(result.current.state.coachMessages.at(-1)?.proposal?.applyStatus).toBe(
      "auto_applied"
    );
  });

  it("keeps the latest proposal available across later non-proposal replies", async () => {
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 1,
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
    expect(proposalMessages[0]?.proposal?.applyStatus).toBe("auto_applied");
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
      const proposal =
        result.current.state.coachMessages[proposalIndex]?.proposal;
      expect(
        proposal && isCoachPolicyProposal(proposal)
          ? proposal.policyPatches.length
          : 0
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
    expect(applyDraftPolicyMock).toHaveBeenCalledWith(nextPolicy);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("1 session moved")
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
    expect(refreshDraftPreviewMock).toHaveBeenCalledTimes(2); // auto + manual attempt
    expect(applyDraftPolicyMock).toHaveBeenCalledTimes(1); // auto-apply only
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Planner preferences could not be updated."
    );
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("auto_applied");
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
      unsupportedPatchCount: 0,
    });
    const refreshDraftPreviewMock = vi
      .fn()
      .mockResolvedValueOnce(context.preview)
      .mockRejectedValueOnce(new Error("Preview refresh failed."));
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
    expect(refreshDraftPreviewMock).toHaveBeenCalledTimes(2);
    expect(applyDraftPolicyMock).toHaveBeenCalledTimes(1); // auto-apply only
    expect(toastErrorMock).toHaveBeenCalledWith("Preview refresh failed.");
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("auto_applied");
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

describe("usePlannerCoach replan pinning", () => {
  beforeEach(() => {
    listPlannerCoachConversationsMock.mockReset().mockResolvedValue([]);
    restorePlannerCoachConversationMock.mockReset();
    savePlannerCoachConversationMock.mockReset();
    persistPlannerDefaultPolicyMock.mockReset().mockResolvedValue(null);
    loadCoachSessionMock.mockReset().mockReturnValue([]);
    saveCoachSessionMock.mockReset();
    applyCoachPolicyPatchesMock.mockReset();
    requestPlannerCoachReplyMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  function arrangeProposal() {
    const context = buildContext();
    const nextPolicy = buildPolicy({ restWeekdays: [0, 6] });
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: nextPolicy,
      appliedPatchCount: 1,
      ignoredPatchCount: 0,
      noOpPatchCount: 0,
      unsupportedPatchCount: 0,
    });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Keeping weekends clear.",
      proposal: {
        policyPatches: [{ kind: "set_rest_weekdays", restWeekdays: [0, 6] }],
        unresolvedQuestions: [],
      },
      recommendations: [],
      warnings: [],
    });
    return { context, nextPolicy };
  }

  it("pins the replan moves before refreshing the draft preview", async () => {
    const { context, nextPolicy } = arrangeProposal();
    const callOrder: string[] = [];
    const applyPolicyReplanMoves = vi.fn(async () => {
      callOrder.push("replan");
      return { moveCount: 2, movedEntryKeys: ["goal-a:total:1"] };
    });
    const refreshDraftPreview = vi.fn(async () => {
      callOrder.push("refresh");
      return context.preview!;
    });

    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          applyPolicyReplanMoves,
          refreshDraftPreview,
        })
      )
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      result.current.actions.setCoachInput("Keep my weekends free");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    expect(applyPolicyReplanMoves).toHaveBeenCalledWith(nextPolicy);
    // Pins must exist before the stable solve, or the refresh reverts them.
    expect(callOrder).toEqual(["replan", "refresh"]);

    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );
    const proposal = result.current.state.coachMessages[proposalIndex]?.proposal;
    expect(proposal?.applyStatus).toBe("auto_applied");
    expect(proposal?.appliedMoveEntryKeys).toEqual(["goal-a:total:1"]);
  });

  it("clears the pins it created when the proposal is undone", async () => {
    const { context, nextPolicy } = arrangeProposal();
    const clearDraftMoveCommands = vi.fn();
    const refreshDraftPreview = vi.fn().mockResolvedValue(context.preview!);

    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [buildEntry()]]]),
          effectivePreview: context.preview,
          effectiveDraftPolicy: nextPolicy,
          applyPolicyReplanMoves: vi
            .fn()
            .mockResolvedValue({ moveCount: 1, movedEntryKeys: ["goal-a:total:1"] }),
          refreshDraftPreview,
          clearDraftMoveCommands,
        })
      )
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      result.current.actions.setCoachInput("Keep my weekends free");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });
    await waitFor(() => {
      expect(
        result.current.state.coachMessages.some((message) => message.proposal)
      ).toBe(true);
    });
    const proposalIndex = result.current.state.coachMessages.findIndex(
      (message) => message.role === "assistant" && Boolean(message.proposal)
    );

    await act(async () => {
      await result.current.actions.undoCoachProposal(proposalIndex);
    });

    // Reverting the policy alone would leave the coach's moves pinned, so the
    // schedule would keep the change the user just undid.
    expect(clearDraftMoveCommands).toHaveBeenCalledWith(["goal-a:total:1"]);
    expect(
      result.current.state.coachMessages[proposalIndex]?.proposal?.applyStatus
    ).toBe("undone");
  });

  it("queues sessionMoves onto the calendar without a policy replan", async () => {
    const context = buildContext();
    applyCoachPolicyPatchesMock.mockReturnValue({
      policy: buildPolicy(),
      appliedPatchCount: 0,
      ignoredPatchCount: 0,
      noOpPatchCount: 0,
      unsupportedPatchCount: 0,
    });
    requestPlannerCoachReplyMock.mockResolvedValue({
      schemaVersion: "1",
      phase: "ready",
      reply: "Moved that session to Saturday.",
      proposal: {
        policyPatches: [
          {
            kind: "move_session",
            goalId: "goal-1",
            unitKey: "unit-1",
            scheduledDate: "2026-09-12",
          },
        ],
        unresolvedQuestions: [],
      },
      recommendations: [],
      warnings: [],
    });
    const queueDraftMoveCommand = vi.fn().mockReturnValue(true);
    const applyPolicyReplanMoves = vi.fn();
    const refreshDraftPreview = vi.fn().mockResolvedValue(context.preview!);
    const entry = buildEntry();

    const { result } = renderHook(() =>
      usePlannerCoach(
        buildArgs({
          activeTab: "calendar",
          context,
          entriesByDate: new Map([["2026-08-01", [entry]]]),
          effectivePreview: context.preview,
          queueDraftMoveCommand,
          applyPolicyReplanMoves,
          refreshDraftPreview,
        })
      )
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      result.current.actions.setCoachInput("Move my long run to Saturday");
    });
    await act(async () => {
      await result.current.actions.sendCoachMessage();
    });

    expect(queueDraftMoveCommand).toHaveBeenCalledWith({
      entry,
      nextDate: "2026-09-12",
      source: "coach",
    });
    expect(applyPolicyReplanMoves).not.toHaveBeenCalled();
    expect(refreshDraftPreview).toHaveBeenCalled();
  });
});
