"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { BulkGoalDraft } from "@/features/goals/bulk-goal-drafts";
import { buildCoachSummaryWorkUnits } from "@/features/planner/calendar-entries";
import {
  persistPlannerDefaultPolicy,
  requestPlannerCoachReply,
} from "@/features/planner/coach/coach-client";
import {
  buildAssistantMessage,
  buildCoachMessageProposal,
  buildDurableApplyToastDetail,
  type CoachProposalAutoApplyStatus,
} from "@/features/planner/coach/coach-message-utils";
import {
  buildCoachCalendarEditsPrompt,
  buildCoachFocusGoalIds,
  computeHasCoachConversationState,
  buildCoachGoalHint,
  countAssignmentChanges,
} from "@/features/planner/coach/coach-state-utils";
import {
  createCoachGoalDrafts as persistCoachGoalDrafts,
  parseCoachGoalDrafts,
} from "@/features/planner/coach/coach-goal-draft-service";
import {
  markAppliedProposalsUndone,
  isCoachGoalDraftProposal,
  readAssistantMessageWithProposal,
  updateAssistantProposalStatus,
} from "@/features/planner/coach/coach-message-state";
import { validateUndoProposal } from "@/features/planner/coach/coach-proposal-utils";
import { useCoachConversationPersistence } from "@/features/planner/coach/use-coach-conversation-persistence";
import type {
  CoachGoalDraftRuntimeState,
  PlannerCoachModel,
  UsePlannerCoachArgs,
} from "@/features/planner/coach/coach-types";
import { buildCoachDeterministicSummary } from "@/features/planner/coach-context";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import {
  COACH_SESSION_MAX_MESSAGES,
  saveCoachSession,
} from "@/features/planner/coach-session";
import type {
  CoachGoalDraftMessageProposal,
  CoachMessage,
  CoachPolicyMessageProposal,
} from "@/features/planner/calendar-surface.types";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { plannerPolicySchema } from "@/lib/planner/policy";

interface CoachProposalApplyResult {
  status: CoachProposalApplyStatus;
  /** Draft pins this apply created, so undo can remove exactly those. */
  movedEntryKeys: string[];
}

type CoachProposalApplyStatus = CoachProposalAutoApplyStatus;

function coachGoalDraftRuntimeKey(
  _message: CoachMessage,
  proposal: CoachGoalDraftMessageProposal
) {
  return proposal.proposalId;
}

export function usePlannerCoach({
  activeTab,
  context,
  entriesByDate,
  effectivePreview,
  effectiveDraftPolicy,
  hasDraftSession,
  refreshDraftPreview,
  applyPolicyReplanMoves,
  queueDraftMoveCommand,
  clearDraftMoveCommands,
  applyDraftPolicy,
  onGoalsCreated,
  coachWindow,
  getNonPublishablePreviewMessage,
}: UsePlannerCoachArgs): PlannerCoachModel {
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachWarnings, setCoachWarnings] = useState<string[]>([]);
  const [coachRecommendations, setCoachRecommendations] = useState<string[]>([]);
  const [coachUnresolvedQuestions, setCoachUnresolvedQuestions] = useState<string[]>(
    []
  );
  const [coachPolicyApplying, setCoachPolicyApplying] = useState(false);
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);
  const [coachGoalDraftStatesByKey, setCoachGoalDraftStatesByKey] = useState<
    Record<string, CoachGoalDraftRuntimeState>
  >({});
  const [coachGoalRefreshStatus, setCoachGoalRefreshStatus] = useState<
    "idle" | "refreshing" | "failed"
  >("idle");
  const [coachGoalRefreshError, setCoachGoalRefreshError] = useState<
    string | null
  >(null);
  const parsingGoalDraftMessagesRef = useRef(new Set<string>());

  const resetCoachUiState = useCallback((messages: CoachMessage[] = []) => {
    setCoachMessages(messages);
    setCoachWarnings([]);
    setCoachRecommendations([]);
    setCoachUnresolvedQuestions([]);
    setCoachContextEvents([]);
    setCoachGoalDraftStatesByKey({});
    parsingGoalDraftMessagesRef.current.clear();
  }, []);

  const appendCoachContextEvent = useCallback((event: string) => {
    setCoachContextEvents((previous) => [...previous, event].slice(-10));
  }, []);

  const persistCoachMessages = useCallback(
    (messages: CoachMessage[]) => {
      if (!context?.scopeMonth || !context?.timezone) {
        return;
      }
      saveCoachSession(context.scopeMonth, context.timezone, messages);
    },
    [context]
  );

  const generateCoachGoalDrafts = useCallback(
    async (messageIndex: number) => {
      const proposal = coachMessages[messageIndex]?.proposal;
      const message = coachMessages[messageIndex];
      if (
        !message ||
        !proposal ||
        !isCoachGoalDraftProposal(proposal) ||
        proposal.creationStatus === "created" ||
        !context?.timezone
      ) {
        return;
      }
      const runtimeKey = coachGoalDraftRuntimeKey(message, proposal);
      if (parsingGoalDraftMessagesRef.current.has(runtimeKey)) {
        return;
      }

      parsingGoalDraftMessagesRef.current.add(runtimeKey);
      setCoachGoalDraftStatesByKey((previous) => ({
        ...previous,
        [runtimeKey]: {
          status: "loading",
          drafts: previous[runtimeKey]?.drafts ?? [],
          warnings: previous[runtimeKey]?.warnings ?? [],
        },
      }));
      try {
        const result = await parseCoachGoalDrafts({
          parserPrompt: proposal.parserPrompt,
          timezone: context.timezone,
        });
        setCoachGoalDraftStatesByKey((previous) => ({
          ...previous,
          [runtimeKey]: {
            status: "ready",
            drafts: result.drafts,
            warnings: result.warnings,
          },
        }));
      } catch (error) {
        const errorCode =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "parse_failed";
        setCoachGoalDraftStatesByKey((previous) => ({
          ...previous,
          [runtimeKey]: {
            status: "error",
            drafts: previous[runtimeKey]?.drafts ?? [],
            warnings: previous[runtimeKey]?.warnings ?? [],
            errorCode,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Could not generate goal drafts.",
          },
        }));
      } finally {
        parsingGoalDraftMessagesRef.current.delete(runtimeKey);
      }
    },
    [coachMessages, context?.timezone]
  );

  useEffect(() => {
    for (const [messageIndex, message] of coachMessages.entries()) {
      if (
        message.proposal &&
        isCoachGoalDraftProposal(message.proposal) &&
        message.proposal.creationStatus !== "created" &&
        !coachGoalDraftStatesByKey[
          coachGoalDraftRuntimeKey(message, message.proposal)
        ]
      ) {
        void generateCoachGoalDrafts(messageIndex);
      }
    }
  }, [coachGoalDraftStatesByKey, coachMessages, generateCoachGoalDrafts]);

  const setCoachGoalDrafts = useCallback(
    (messageIndex: number, drafts: SetStateAction<BulkGoalDraft[]>) => {
      const message = coachMessages[messageIndex];
      const proposal = message?.proposal;
      if (!message || !proposal || !isCoachGoalDraftProposal(proposal)) return;
      const runtimeKey = coachGoalDraftRuntimeKey(message, proposal);
      setCoachGoalDraftStatesByKey((previous) => {
        const state = previous[runtimeKey];
        if (!state) return previous;
        return {
          ...previous,
          [runtimeKey]: {
            ...state,
            drafts:
              typeof drafts === "function" ? drafts(state.drafts) : drafts,
          },
        };
      });
    },
    [coachMessages]
  );

  const {
    state: {
      savedCoachConversations,
      selectedSavedCoachConversationId,
      coachConversationsLoading,
      coachConversationSaving,
      coachConversationRestoring,
    },
    actions: {
      setSelectedSavedCoachConversationId,
      saveCoachConversation: saveCoachConversationInternal,
      restoreSavedCoachConversation: restoreSavedCoachConversationInternal,
      startNewCoachConversation: startNewCoachConversationInternal,
      resetForPlannerStateReset,
    },
  } = useCoachConversationPersistence({
    activeTab,
    scopeMonth: context?.scopeMonth,
    timezone: context?.timezone,
    coachMessages,
    resetCoachUiState,
    setCoachInput,
    persistCoachMessages,
  });

  const saveCoachConversation = useCallback(async () => {
    if (coachGoalRefreshStatus !== "idle") return;
    await saveCoachConversationInternal();
  }, [coachGoalRefreshStatus, saveCoachConversationInternal]);

  const restoreSavedCoachConversation = useCallback(
    async (conversationId: string) => {
      if (coachGoalRefreshStatus !== "idle") return;
      await restoreSavedCoachConversationInternal(conversationId);
    },
    [coachGoalRefreshStatus, restoreSavedCoachConversationInternal]
  );

  const startNewCoachConversation = useCallback(() => {
    if (coachGoalRefreshStatus !== "idle") return;
    startNewCoachConversationInternal();
  }, [coachGoalRefreshStatus, startNewCoachConversationInternal]);

  const coachSummaryWorkUnits = useMemo(
    () => buildCoachSummaryWorkUnits(entriesByDate),
    [entriesByDate]
  );

  const coachFocusGoalIds = useMemo(() => {
    return buildCoachFocusGoalIds({
      workUnits: effectivePreview?.workUnits,
      goalTitles: context?.goalTitles,
    });
  }, [context, effectivePreview]);

  const applyCoachPatchesToDraft = useCallback(
    async ({
      patches,
      source,
    }: {
      patches: CoachPolicyPatch[];
      source: "auto" | "manual";
    }): Promise<CoachProposalApplyResult> => {
      if (!context?.preferences || patches.length === 0) {
        return { status: "not_attempted", movedEntryKeys: [] };
      }
      const priorPolicy = plannerPolicySchema.parse(
        effectiveDraftPolicy ?? context.preferences.defaultPolicy
      );
      const result = applyCoachPolicyPatches({
        policy: priorPolicy,
        patches,
      });
      const sessionMoves = patches.filter(
        (patch): patch is Extract<CoachPolicyPatch, { kind: "move_session" }> =>
          patch.kind === "move_session"
      );
      const calendarEntries = [...entriesByDate.values()].flat();
      let queuedSessionMoves = 0;
      let missingSessionMoves = 0;
      const queuedMovedEntryKeys: string[] = [];
      for (const move of sessionMoves) {
        const entry = calendarEntries.find(
          (item) =>
            item.originalGoalId === move.goalId &&
            item.unitKey === move.unitKey &&
            !item.draftGhost
        );
        if (!entry) {
          missingSessionMoves += 1;
          continue;
        }
        if (
          queueDraftMoveCommand({
            entry,
            nextDate: move.scheduledDate,
            source: "coach",
          })
        ) {
          queuedSessionMoves += 1;
          queuedMovedEntryKeys.push(entry.key);
        }
      }
      if (missingSessionMoves > 0) {
        toast.error(
          missingSessionMoves === 1
            ? "Coach suggested moving a session reference that is not available in this draft."
            : `Coach suggested moving ${missingSessionMoves} session references that are not available in this draft.`
        );
      }
      if (result.appliedPatchCount === 0 && queuedSessionMoves === 0) {
        if (sessionMoves.length > 0) {
          return { status: "failed", movedEntryKeys: [] };
        }
        if (result.noOpPatchCount > 0 && result.unsupportedPatchCount === 0) {
          appendCoachContextEvent("Coach proposal already matched current draft");
          toast.success(
            hasDraftSession
              ? "Coach proposal already matches your draft policy. Your manual draft edits are still pending publish."
              : "Coach proposal already matches your current policy."
          );
          return { status: "already_applied", movedEntryKeys: [] };
        }
        toast.error("No applicable policy changes were available to apply.");
        return { status: "failed", movedEntryKeys: [] };
      }

      setCoachPolicyApplying(true);
      try {
        let moveCount = queuedSessionMoves;
        let movedEntryKeys = queuedMovedEntryKeys;
        if (result.appliedPatchCount > 0) {
          const replanned = await applyPolicyReplanMoves(result.policy);
          moveCount += replanned.moveCount;
          movedEntryKeys = [...movedEntryKeys, ...replanned.movedEntryKeys];
        }
        const refreshedPreview = await refreshDraftPreview(result.policy);
        if (!refreshedPreview) {
          throw new Error("Preview refresh returned no planner data.");
        }
        if (source === "manual") {
          await persistPlannerDefaultPolicy({
            timezone: context.preferences.timezone,
            defaultPolicy: result.policy,
          });
          appendCoachContextEvent("Persisted coach proposal to planner defaults");
        }
        const assignmentChanges = countAssignmentChanges({
          previousWorkUnits: effectivePreview?.workUnits,
          refreshedWorkUnits: refreshedPreview.workUnits,
        });
        applyDraftPolicy(result.policy);
        appendCoachContextEvent(
          `Reflected coach proposal in draft (${result.appliedPatchCount} patches, ${moveCount} session moves)`
        );
        const lead =
          source === "auto"
            ? "Coach updates are in your draft"
            : "Coach proposal applied";
        if (!refreshedPreview.solver.publishable) {
          toast.error(
            `${lead}, but this draft cannot publish yet. ${getNonPublishablePreviewMessage(
              refreshedPreview
            )}`
          );
        } else if (assignmentChanges === 0 && queuedSessionMoves === 0) {
          // Auto-reflect means an unchanged calendar is the only signal the
          // user gets, so say plainly that nothing needed to move.
          toast.success(
            `${lead}. Your preferences changed, but no session needed to move.`
          );
        } else {
          const movedCount = Math.max(assignmentChanges, queuedSessionMoves);
          toast.success(
            `${lead}: ${movedCount} session${
              movedCount === 1 ? "" : "s"
            } moved. Review the highlighted changes and save when ready.`
          );
        }
        if (source === "manual" && context.scopeMonth) {
          toast.success(
            buildDurableApplyToastDetail({
              scopeMonth: context.scopeMonth,
              includedDraftPolicyChanges:
                hasDraftSession ||
                effectiveDraftPolicy !== null,
            })
          );
        }
        return { status: "applied", movedEntryKeys };
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : source === "auto"
              ? "Coach proposal auto-apply failed."
              : "Coach proposal apply failed."
        );
        return { status: "failed", movedEntryKeys: [] };
      } finally {
        setCoachPolicyApplying(false);
      }
    },
    [
      appendCoachContextEvent,
      applyDraftPolicy,
      applyPolicyReplanMoves,
      context,
      effectiveDraftPolicy,
      effectivePreview,
      entriesByDate,
      getNonPublishablePreviewMessage,
      hasDraftSession,
      queueDraftMoveCommand,
      refreshDraftPreview,
    ]
  );

  const sendCoachMessage = useCallback(async () => {
    if (!coachWindow || !context?.timezone) {
      toast.error("Planner coach is currently unavailable.");
      return;
    }
    const trimmed = coachInput.trim();
    if (!trimmed) {
      return;
    }
    const userMessage: CoachMessage = {
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const nextMessages = [...coachMessages, userMessage].slice(
      -COACH_SESSION_MAX_MESSAGES
    );
    setCoachMessages(nextMessages);
    setCoachInput("");
    setCoachLoading(true);
    setCoachWarnings([]);

    const deterministicSummary = buildCoachDeterministicSummary({
      startDate: coachWindow.start,
      endDate: coachWindow.end,
      timezone: context.timezone,
      asOfDate: context.asOfDate,
      workUnits: coachSummaryWorkUnits,
      horizonSummary: effectivePreview?.horizonSummary ?? [],
      focusGoalIds: coachFocusGoalIds,
      goalTitles: context.goalTitles,
      events: coachContextEvents,
    });

    try {
      const coachPayload = await requestPlannerCoachReply({
        startDate: coachWindow.start,
        endDate: coachWindow.end,
        scopeMonth: context.scopeMonth,
        messages: nextMessages,
        focusGoalIds: coachFocusGoalIds,
        deterministicSummary,
      });
      const recommendations = (coachPayload.recommendations ?? []).map((item) => item.text);
      const warnings = coachPayload.warnings ?? [];
      const unresolvedQuestions = coachPayload.proposal?.unresolvedQuestions ?? [];
      const policyPatches = coachPayload.proposal?.policyPatches ?? [];
      const goalDraftPrompt = coachPayload.proposal?.goalDraftPrompt?.trim() || null;
      let autoApplyStatus: CoachProposalApplyStatus = "not_attempted";
      let autoAppliedEntryKeys: string[] = [];
      const baselinePolicy = context.preferences
        ? plannerPolicySchema.parse(effectiveDraftPolicy ?? context.preferences.defaultPolicy)
        : null;
      if (policyPatches.length > 0) {
        const autoApply = await applyCoachPatchesToDraft({
          patches: policyPatches,
          source: "auto",
        });
        autoApplyStatus = autoApply.status;
        autoAppliedEntryKeys = autoApply.movedEntryKeys;
      }
      const policyProposal = buildCoachMessageProposal({
        policyPatches,
        unresolvedQuestions,
        baselinePolicy,
        autoApplyStatus,
        autoAppliedEntryKeys,
      });
      const goalDraftProposal: CoachGoalDraftMessageProposal | null =
        goalDraftPrompt
          ? {
              schemaVersion: "1",
              kind: "goal_draft",
              proposalId: crypto.randomUUID(),
              parserPrompt: goalDraftPrompt,
              creationStatus: "not_created",
            }
          : null;
      const assistantMessage: CoachMessage = {
        role: "assistant",
        content: buildAssistantMessage({
          reply: coachPayload.reply,
          recommendations,
          warnings,
          unresolvedQuestions,
          policyPatches,
          autoApplyStatus,
        }),
        createdAt: Date.now(),
        proposal: goalDraftProposal ?? policyProposal,
      };
      const finalMessages = [...nextMessages, assistantMessage].slice(
        -COACH_SESSION_MAX_MESSAGES
      );
      setCoachMessages(finalMessages);
      persistCoachMessages(finalMessages);
      setCoachWarnings(warnings);
      setCoachRecommendations(recommendations);
      setCoachUnresolvedQuestions(unresolvedQuestions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Coach response failed.");
    } finally {
      setCoachLoading(false);
    }
  }, [
    coachContextEvents,
    coachFocusGoalIds,
    coachInput,
    coachMessages,
    coachSummaryWorkUnits,
    context,
    applyCoachPatchesToDraft,
    effectiveDraftPolicy,
    effectivePreview?.horizonSummary,
    persistCoachMessages,
    coachWindow,
  ]);

  const updateCoachProposalStatus = useCallback(
    (
      messageIndex: number,
      applyStatus: CoachPolicyMessageProposal["applyStatus"],
      appliedMoveEntryKeys?: string[]
    ) => {
      setCoachMessages((previous) => {
        const { changed, nextMessages } = updateAssistantProposalStatus({
          messages: previous,
          messageIndex,
          applyStatus,
          appliedMoveEntryKeys,
        });
        if (!changed) {
          return previous;
        }
        persistCoachMessages(nextMessages);
        return nextMessages;
      });
    },
    [persistCoachMessages]
  );

  const createCoachGoalDrafts = useCallback(
    async (messageIndex: number) => {
      const message = coachMessages[messageIndex];
      const proposal = message?.proposal;
      if (
        !message ||
        !proposal ||
        !isCoachGoalDraftProposal(proposal) ||
        proposal.creationStatus === "created"
      ) {
        return;
      }
      const runtimeKey = coachGoalDraftRuntimeKey(message, proposal);
      const draftState = coachGoalDraftStatesByKey[runtimeKey];
      if (
        !draftState ||
        draftState.status === "saving" ||
        draftState.status === "created"
      ) {
        return;
      }
      if (coachGoalRefreshStatus !== "idle") {
        toast.error(
          "Finish refreshing the calendar before creating another goal proposal."
        );
        return;
      }
      if (hasDraftSession) {
        toast.error("Save or discard pending calendar edits before creating goals.");
        return;
      }

      setCoachGoalRefreshStatus("refreshing");
      setCoachGoalRefreshError(null);
      setCoachGoalDraftStatesByKey((previous) => ({
        ...previous,
        [runtimeKey]: {
          ...draftState,
          status: "saving",
          errorCode: undefined,
          errorMessage: undefined,
        },
      }));
      try {
        const { createdCount } = await persistCoachGoalDrafts({
          drafts: draftState.drafts,
        });
        const nextMessages: CoachMessage[] = coachMessages.map(
          (entry, index) =>
            index === messageIndex
              ? {
                  ...entry,
                  proposal: {
                    ...proposal,
                    creationStatus: "created" as const,
                  },
                }
              : entry
        );
        setCoachMessages(nextMessages);
        persistCoachMessages(nextMessages);
        setCoachGoalDraftStatesByKey((previous) => ({
          ...previous,
          [runtimeKey]: {
            ...draftState,
            status: "created",
          },
        }));
        toast.success(
          `Created ${createdCount} goal${createdCount === 1 ? "" : "s"}. This action is not undoable here; edit or delete created goals from Goals.`
        );
        try {
          await onGoalsCreated();
          setCoachGoalRefreshStatus("idle");
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The calendar could not refresh.";
          setCoachGoalRefreshStatus("failed");
          setCoachGoalRefreshError(message);
          toast.error(
            `Goals were created, but the calendar could not refresh: ${message}`
          );
        }
      } catch (error) {
        setCoachGoalRefreshStatus("idle");
        const errorCode =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "create_failed";
        setCoachGoalDraftStatesByKey((previous) => ({
          ...previous,
          [runtimeKey]: {
            ...draftState,
            status: "error",
            errorCode,
            errorMessage:
              error instanceof Error ? error.message : "Could not create goals.",
          },
        }));
      }
    },
    [
      coachGoalDraftStatesByKey,
      coachGoalRefreshStatus,
      coachMessages,
      hasDraftSession,
      onGoalsCreated,
      persistCoachMessages,
    ]
  );

  const retryCoachGoalRefresh = useCallback(async () => {
    if (coachGoalRefreshStatus === "refreshing") return;
    setCoachGoalRefreshStatus("refreshing");
    setCoachGoalRefreshError(null);
    try {
      await onGoalsCreated();
      setCoachGoalRefreshStatus("idle");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The calendar could not refresh.";
      setCoachGoalRefreshStatus("failed");
      setCoachGoalRefreshError(message);
      toast.error(`Calendar refresh failed: ${message}`);
    }
  }, [coachGoalRefreshStatus, onGoalsCreated]);

  const applyCoachProposal = useCallback(
    async (messageIndex: number) => {
      const message = readAssistantMessageWithProposal({
        messages: coachMessages,
        messageIndex,
      });
      if (!message) {
        return;
      }
      const { status, movedEntryKeys } = await applyCoachPatchesToDraft({
        patches: message.proposal.policyPatches,
        source: "manual",
      });
      if (status === "applied") {
        updateCoachProposalStatus(messageIndex, "manually_applied", movedEntryKeys);
      }
    },
    [applyCoachPatchesToDraft, coachMessages, updateCoachProposalStatus]
  );

  const rejectCoachProposal = useCallback(() => {
    appendCoachContextEvent("Rejected coach proposal");
    setCoachUnresolvedQuestions([]);
    toast.success("Coach proposal dismissed.");
  }, [appendCoachContextEvent]);

  const requestCalendarEditsFromCoach = useCallback(() => {
    const goalHint = buildCoachGoalHint({
      focusGoalIds: coachFocusGoalIds,
      goalTitles: context?.goalTitles,
    });
    setCoachInput(buildCoachCalendarEditsPrompt(goalHint).trim());
  }, [coachFocusGoalIds, context]);

  const undoCoachProposal = useCallback(
    async (messageIndex: number) => {
      const message = readAssistantMessageWithProposal({
        messages: coachMessages,
        messageIndex,
      });
      if (!message) {
        return;
      }

      const validation = validateUndoProposal({
        proposal: message.proposal,
        preferences: context?.preferences,
        effectiveDraftPolicy,
      });
      if (!validation.ok) {
        if (validation.reason === "missing_preferences") {
          toast.error("Undo is unavailable because planner policy is not loaded.");
          return;
        }
        if (validation.reason === "missing_baseline") {
          toast.error(
            "Undo is unavailable because this proposal has no baseline snapshot."
          );
          return;
        }
        if (validation.reason === "stale_draft_policy") {
          toast.error(
            "Undo is blocked because newer draft policy changes were applied after this proposal. Undo newer proposals first or discard draft changes."
          );
          return;
        }
        return;
      }
      const { baselinePolicy, currentDraftPolicy, shouldPersistDurableUndo } = validation;
      const preferences = context?.preferences;
      if (!preferences) {
        toast.error("Undo is unavailable because planner policy is not loaded.");
        return;
      }
      const scopeMonth = context?.scopeMonth ?? null;
      setCoachPolicyApplying(true);
      try {
        // Reverting the policy is not enough: the apply also pinned the moves
        // the policy implied. Clear those first so the baseline solve is not
        // still constrained by them.
        clearDraftMoveCommands(message.proposal.appliedMoveEntryKeys ?? []);
        await refreshDraftPreview(baselinePolicy);
        if (shouldPersistDurableUndo) {
          try {
            await persistPlannerDefaultPolicy({
              timezone: preferences.timezone,
              defaultPolicy: baselinePolicy,
            });
          } catch (error) {
            try {
              await refreshDraftPreview(currentDraftPolicy);
              applyDraftPolicy(currentDraftPolicy);
              appendCoachContextEvent(
                "Reverted undo preview after planner default restore failed"
              );
            } catch {
              appendCoachContextEvent(
                "Undo failed after preview update; draft preview may need regeneration"
              );
            }
            throw error;
          }
        }
        applyDraftPolicy(baselinePolicy);
        updateCoachProposalStatus(messageIndex, "undone");
        appendCoachContextEvent("Undid coach draft proposal");
        toast.success(
          shouldPersistDurableUndo
            ? scopeMonth
              ? `Coach proposal changes were undone. Planner defaults were restored from ${scopeMonth}.`
              : "Coach proposal changes were undone."
            : "Coach draft preview changes were undone."
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Undo failed.");
      } finally {
        setCoachPolicyApplying(false);
      }
    },
    [
      appendCoachContextEvent,
      applyDraftPolicy,
      clearDraftMoveCommands,
      coachMessages,
      context,
      effectiveDraftPolicy,
      refreshDraftPreview,
      updateCoachProposalStatus,
    ]
  );

  const onDraftDiscarded = useCallback(() => {
    setCoachMessages((previous) => {
      const { changed, nextMessages } = markAppliedProposalsUndone(previous);
      if (changed) {
        persistCoachMessages(nextMessages);
      }
      return nextMessages;
    });
    appendCoachContextEvent("Discarded draft changes");
  }, [appendCoachContextEvent, persistCoachMessages]);

  const canUseCoach = Boolean(coachWindow && context?.timezone);
  const coachGoalDraftStates = useMemo(
    () =>
      coachMessages.reduce<Record<number, CoachGoalDraftRuntimeState>>(
        (states, message, index) => {
          if (
            message.proposal &&
            isCoachGoalDraftProposal(message.proposal)
          ) {
            const state =
              coachGoalDraftStatesByKey[
                coachGoalDraftRuntimeKey(message, message.proposal)
              ];
            if (state) states[index] = state;
          }
          return states;
        },
        {}
      ),
    [coachGoalDraftStatesByKey, coachMessages]
  );
  const hasCoachConversationState = computeHasCoachConversationState({
    coachMessages,
    coachWarnings,
    coachRecommendations,
    coachUnresolvedQuestions,
    coachContextEvents,
    coachInput,
  });

  return {
    state: {
      canUseCoach,
      coachLoading,
      coachInput,
      coachMessages,
      savedCoachConversations,
      selectedSavedCoachConversationId,
      coachConversationsLoading,
      coachConversationSaving,
      coachConversationRestoring,
      coachWarnings,
      coachRecommendations,
      coachUnresolvedQuestions,
      coachPolicyApplying,
      coachGoalDraftStates,
      hasPendingCalendarEdits: hasDraftSession,
      coachGoalRefreshStatus,
      coachGoalRefreshError,
      hasCoachConversationState,
    },
    actions: {
      setCoachInput,
      setSelectedSavedCoachConversationId,
      sendCoachMessage,
      saveCoachConversation,
      restoreSavedCoachConversation,
      startNewCoachConversation,
      applyCoachProposal,
      rejectCoachProposal,
      requestCalendarEditsFromCoach,
      undoCoachProposal,
      generateCoachGoalDrafts,
      createCoachGoalDrafts,
      setCoachGoalDrafts,
      retryCoachGoalRefresh,
      resetForPlannerStateReset,
      onDraftDiscarded,
    },
  };
}
