"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildCoachSummaryWorkUnits } from "@/features/planner/calendar-entries";
import {
  listPlannerCoachConversations,
  requestPlannerCoachReply,
  restorePlannerCoachConversation,
  savePlannerCoachConversation,
} from "@/features/planner/coach/coach-client";
import type {
  PlannerCoachModel,
  UsePlannerCoachArgs,
} from "@/features/planner/coach/coach-types";
import { buildCoachDeterministicSummary } from "@/features/planner/coach-context";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import {
  buildCoachSessionKey,
  COACH_SESSION_MAX_MESSAGES,
  loadCoachSession,
  saveCoachSession,
} from "@/features/planner/coach-session";
import type {
  CoachLastProposalMeta,
  CoachMessage,
} from "@/features/planner/calendar-surface.types";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";

const MAX_COACH_MESSAGE_CHARACTERS = 12_000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CoachProposalApplyStatus =
  | "not_attempted"
  | "applied"
  | "already_applied"
  | "failed";

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function formatWeekdayList(weekdays: number[]) {
  const labels = dedupeWeekdays(weekdays)
    .map((weekday) => WEEKDAY_NAMES[weekday] ?? null)
    .filter((weekday): weekday is (typeof WEEKDAY_NAMES)[number] => weekday !== null);
  return labels.length > 0 ? labels.join(", ") : "none";
}

function formatSpacingStrategy(strategy: "front_load" | "even" | "flexible") {
  switch (strategy) {
    case "front_load":
      return "front-loaded";
    case "even":
      return "even";
    case "flexible":
      return "flexible";
  }
}

function resolveGoalTitle(goalId: string, goalTitles: Record<string, string> | undefined) {
  const title = goalTitles?.[goalId];
  if (title && title.trim().length > 0) {
    return title.trim();
  }
  return "Selected goal";
}

function describePolicyPatch(
  patch: CoachPolicyPatch,
  goalTitles: Record<string, string> | undefined
) {
  switch (patch.kind) {
    case "set_rest_weekdays":
      return `Set rest weekdays to ${formatWeekdayList(patch.restWeekdays)}.`;
    case "add_blackout_range":
      return `Avoid scheduling between ${patch.start} and ${patch.end}.`;
    case "remove_blackout_range":
      return `Remove blackout dates from ${patch.start} to ${patch.end}.`;
    case "set_goal_allowed_weekdays":
      return `${resolveGoalTitle(patch.goalId, goalTitles)}: allow ${formatWeekdayList(
        patch.weekdays
      )}.`;
    case "clear_goal_allowed_weekdays":
      return `${resolveGoalTitle(patch.goalId, goalTitles)}: clear weekday restrictions.`;
    case "set_goal_date_preference":
      return `${
        patch.goalId ? resolveGoalTitle(patch.goalId, goalTitles) : "All goals"
      }: ${patch.effect} ${patch.start} to ${patch.end}.`;
    case "clear_goal_date_preference":
      return `${
        patch.goalId ? resolveGoalTitle(patch.goalId, goalTitles) : "All goals"
      }: clear ${patch.effect} preference for ${patch.start} to ${patch.end}.`;
    case "set_spacing_strategy":
      return `Set overall spacing strategy to ${formatSpacingStrategy(
        patch.spacingStrategy
      )}.`;
    case "set_goal_spacing_strategy":
      return `${resolveGoalTitle(
        patch.goalId,
        goalTitles
      )}: set spacing strategy to ${formatSpacingStrategy(patch.spacingStrategy)}.`;
  }
}

function clampAssistantMessage(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_COACH_MESSAGE_CHARACTERS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_COACH_MESSAGE_CHARACTERS - 1)}…`;
}

function buildAssistantMessage({
  reply,
  recommendations,
  warnings,
  unresolvedQuestions,
  policyPatches,
  goalTitles,
  autoApplyStatus,
}: {
  reply: string;
  recommendations: string[];
  warnings: string[];
  unresolvedQuestions: string[];
  policyPatches: CoachPolicyPatch[];
  goalTitles: Record<string, string> | undefined;
  autoApplyStatus: CoachProposalApplyStatus;
}) {
  const lines: string[] = [reply.trim()];

  if (recommendations.length > 0) {
    lines.push("", "Recommended next actions:");
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  if (policyPatches.length > 0) {
    if (autoApplyStatus === "applied") {
      lines.push("", "Draft updates auto-applied:");
    } else if (autoApplyStatus === "already_applied") {
      lines.push("", "Draft updates already match your current policy:");
    } else if (autoApplyStatus === "failed") {
      lines.push("", "Draft updates proposed (auto-apply did not complete):");
    } else {
      lines.push("", "Draft updates proposed:");
    }
    for (const patch of policyPatches) {
      lines.push(`- ${describePolicyPatch(patch, goalTitles)}`);
    }
  }

  if (unresolvedQuestions.length > 0) {
    lines.push("", "Questions to confirm:");
    for (const question of unresolvedQuestions) {
      lines.push(`- ${question}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "Notes:");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return clampAssistantMessage(lines.join("\n"));
}

export function usePlannerCoach({
  activeTab,
  context,
  entriesByDate,
  effectivePreview,
  effectiveDraftPolicy,
  hasDraftSession,
  refreshDraftPreview,
  applyDraftPolicy,
  getNonPublishablePreviewMessage,
}: UsePlannerCoachArgs): PlannerCoachModel {
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [savedCoachConversations, setSavedCoachConversations] = useState<
    PlannerCoachModel["state"]["savedCoachConversations"]
  >([]);
  const [selectedSavedCoachConversationId, setSelectedSavedCoachConversationId] =
    useState("");
  const [coachConversationsLoading, setCoachConversationsLoading] = useState(false);
  const [coachConversationSaving, setCoachConversationSaving] = useState(false);
  const [coachConversationRestoring, setCoachConversationRestoring] = useState(false);
  const [coachWarnings, setCoachWarnings] = useState<string[]>([]);
  const [coachRecommendations, setCoachRecommendations] = useState<string[]>([]);
  const [coachPendingPatches, setCoachPendingPatches] = useState<CoachPolicyPatch[]>(
    []
  );
  const [coachUnresolvedQuestions, setCoachUnresolvedQuestions] = useState<string[]>(
    []
  );
  const [coachPolicyApplying, setCoachPolicyApplying] = useState(false);
  const [coachUndoSnapshot, setCoachUndoSnapshot] = useState<{
    timezone: string;
    defaultPolicy: PlannerPolicy;
  } | null>(null);
  const [coachLastProposalMeta, setCoachLastProposalMeta] =
    useState<CoachLastProposalMeta | null>(null);
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);

  const resetCoachUiState = useCallback((messages: CoachMessage[] = []) => {
    setCoachMessages(messages);
    setCoachWarnings([]);
    setCoachRecommendations([]);
    setCoachPendingPatches([]);
    setCoachUnresolvedQuestions([]);
    setCoachContextEvents([]);
    setCoachUndoSnapshot(null);
    setCoachLastProposalMeta(null);
  }, []);

  const appendCoachContextEvent = useCallback((event: string) => {
    setCoachContextEvents((previous) => [...previous, event].slice(-10));
  }, []);

  const coachSummaryWorkUnits = useMemo(
    () => buildCoachSummaryWorkUnits(entriesByDate),
    [entriesByDate]
  );

  const coachFocusGoalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const unit of effectivePreview?.workUnits ?? []) {
      ids.add(unit.originalGoalId);
    }
    if (ids.size === 0) {
      for (const goalId of Object.keys(context?.goalTitles ?? {})) {
        ids.add(goalId);
      }
    }
    return Array.from(ids).slice(0, 20);
  }, [context, effectivePreview]);

  const loadSavedCoachConversations = useCallback(
    async (scopeMonth: string) => {
      setCoachConversationsLoading(true);
      try {
        const conversations = await listPlannerCoachConversations({ scopeMonth, limit: 20 });
        setSavedCoachConversations(conversations);
        setSelectedSavedCoachConversationId((current) => {
          if (current && conversations.some((conversation) => conversation.id === current)) {
            return current;
          }
          return conversations[0]?.id ?? "";
        });
      } catch (error) {
        setSavedCoachConversations([]);
        setSelectedSavedCoachConversationId("");
        toast.error(
          error instanceof Error
            ? error.message
            : "Saved conversations could not be loaded."
        );
      } finally {
        setCoachConversationsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab !== "calendar" || !context?.scopeMonth || !context?.timezone) {
      return;
    }
    const timer = window.setTimeout(() => {
      const restored = loadCoachSession(context.scopeMonth, context.timezone);
      resetCoachUiState(restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, context?.scopeMonth, context?.timezone, resetCoachUiState]);

  useEffect(() => {
    if (activeTab !== "calendar" || !context?.scopeMonth || !context?.capabilities.coachAi) {
      const timer = window.setTimeout(() => {
        setSavedCoachConversations([]);
        setSelectedSavedCoachConversationId("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void loadSavedCoachConversations(context.scopeMonth);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    context?.capabilities.coachAi,
    context?.scopeMonth,
    loadSavedCoachConversations,
  ]);

  const applyCoachPatchesToDraft = useCallback(
    async ({
      patches,
      source,
    }: {
      patches: CoachPolicyPatch[];
      source: "auto" | "manual";
    }): Promise<CoachProposalApplyStatus> => {
      if (!context?.preferences || patches.length === 0) {
        return "not_attempted";
      }
      const allowedGoalIds = new Set<string>([
        ...Object.keys(context.goalTitles ?? {}),
        ...(context.activePlan?.goals ?? []).map((goal) => goal.original_goal_id),
      ]);
      const priorPolicy = plannerPolicySchema.parse(
        effectiveDraftPolicy ?? context.preferences.defaultPolicy
      );
      const result = applyCoachPolicyPatches({
        policy: priorPolicy,
        patches,
        allowedGoalIds,
      });
      if (result.appliedPatchCount === 0) {
        if (
          result.noOpPatchCount > 0 &&
          result.outOfScopePatchCount === 0 &&
          result.unsupportedPatchCount === 0
        ) {
          appendCoachContextEvent("Coach proposal already matched current draft");
          toast.success(
            hasDraftSession
              ? "Coach proposal already matches your draft policy. Your manual draft edits are still pending publish."
              : "Coach proposal already matches your current policy."
          );
          return "already_applied";
        }
        toast.error(
          result.outOfScopePatchCount > 0
            ? "Coach edits were received but none matched your current goal scope."
            : "No applicable policy changes were available to apply."
        );
        return "failed";
      }

      setCoachPolicyApplying(true);
      try {
        const refreshedPreview = await refreshDraftPreview(result.policy);
        if (!refreshedPreview) {
          throw new Error("Preview refresh returned no planner data.");
        }
        const previousDatesByKey = new Map(
          (effectivePreview?.workUnits ?? []).map((unit) => [
            `${unit.originalGoalId}:${unit.unitKey}`,
            unit.scheduledDate,
          ])
        );
        const refreshedDatesByKey = new Map(
          refreshedPreview.workUnits.map((unit) => [
            `${unit.originalGoalId}:${unit.unitKey}`,
            unit.scheduledDate,
          ])
        );
        let assignmentChanges = 0;
        for (const key of new Set([
          ...previousDatesByKey.keys(),
          ...refreshedDatesByKey.keys(),
        ])) {
          if (previousDatesByKey.get(key) !== refreshedDatesByKey.get(key)) {
            assignmentChanges += 1;
          }
        }
        if (context.scopeMonth) {
          applyDraftPolicy(context.scopeMonth, result.policy);
        }
        setCoachUndoSnapshot({
          timezone: context.preferences.timezone,
          defaultPolicy: priorPolicy,
        });
        appendCoachContextEvent(
          source === "auto"
            ? `Auto-applied coach proposal to draft (${result.appliedPatchCount} patches)`
            : `Applied coach proposal to draft (${result.appliedPatchCount} patches)`
        );
        if (!refreshedPreview.solver.publishable) {
          toast.error(
            `${source === "auto" ? "Coach updates auto-applied" : "Coach proposal applied"}, but this draft cannot publish yet. ${getNonPublishablePreviewMessage(
              refreshedPreview
            )}`
          );
        } else if (assignmentChanges === 0) {
          toast.success(
            source === "auto"
              ? "Coach updates auto-applied. Policy changed, but scheduled sessions stayed the same."
              : "Coach proposal applied. Policy changed, but scheduled sessions stayed the same."
          );
        } else {
          toast.success(
            `${source === "auto" ? "Coach updates auto-applied" : "Coach proposal applied"} to draft preview (${assignmentChanges} session change${
              assignmentChanges === 1 ? "" : "s"
            }).`
          );
        }
        return "applied";
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : source === "auto"
              ? "Coach proposal auto-apply failed."
              : "Coach proposal apply failed."
        );
        return "failed";
      } finally {
        setCoachPolicyApplying(false);
      }
    },
    [
      appendCoachContextEvent,
      applyDraftPolicy,
      context,
      effectiveDraftPolicy,
      effectivePreview,
      getNonPublishablePreviewMessage,
      hasDraftSession,
      refreshDraftPreview,
    ]
  );

  const sendCoachMessage = useCallback(async () => {
    if (!context?.capabilities.coachAi || !context.scopeMonth || !context.timezone) {
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
      scopeMonth: context.scopeMonth,
      timezone: context.timezone,
      asOfDate: context.asOfDate,
      workUnits: coachSummaryWorkUnits,
      events: coachContextEvents,
    });

    try {
      const coachPayload = await requestPlannerCoachReply({
        scopeMonth: context.scopeMonth,
        messages: nextMessages,
        focusGoalIds: coachFocusGoalIds,
        deterministicSummary,
      });
      const recommendations = (coachPayload.recommendations ?? []).map((item) => item.text);
      const warnings = coachPayload.warnings ?? [];
      const unresolvedQuestions = coachPayload.proposal?.unresolvedQuestions ?? [];
      const policyPatches = coachPayload.proposal?.policyPatches ?? [];
      let autoApplyStatus: CoachProposalApplyStatus = "not_attempted";
      if (policyPatches.length > 0) {
        setCoachPendingPatches(policyPatches);
        autoApplyStatus = await applyCoachPatchesToDraft({
          patches: policyPatches,
          source: "auto",
        });
        setCoachLastProposalMeta({
          policyPatchCount: policyPatches.length,
          autoApplied:
            autoApplyStatus === "applied" || autoApplyStatus === "already_applied",
        });
      }
      const assistantMessage: CoachMessage = {
        role: "assistant",
        content: buildAssistantMessage({
          reply: coachPayload.reply,
          recommendations,
          warnings,
          unresolvedQuestions,
          policyPatches,
          goalTitles: context.goalTitles,
          autoApplyStatus,
        }),
        createdAt: Date.now(),
      };
      const finalMessages = [...nextMessages, assistantMessage].slice(
        -COACH_SESSION_MAX_MESSAGES
      );
      setCoachMessages(finalMessages);
      saveCoachSession(context.scopeMonth, context.timezone, finalMessages);
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
  ]);

  const saveCoachConversation = useCallback(async () => {
    if (!context?.scopeMonth || !context?.timezone || coachMessages.length === 0) {
      return;
    }
    setCoachConversationSaving(true);
    try {
      const conversation = await savePlannerCoachConversation({
        scopeMonth: context.scopeMonth,
        timezone: context.timezone,
        messages: coachMessages,
      });
      setSavedCoachConversations((previous) => {
        const remaining = previous.filter((item) => item.id !== conversation.id);
        return [conversation, ...remaining];
      });
      setSelectedSavedCoachConversationId(conversation.id);
      toast.success("Coach conversation saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Coach conversation could not be saved."
      );
    } finally {
      setCoachConversationSaving(false);
    }
  }, [coachMessages, context]);

  const restoreSavedCoachConversation = useCallback(
    async (conversationId: string) => {
      if (!context?.scopeMonth || !context?.timezone || !conversationId) {
        return;
      }
      setCoachConversationRestoring(true);
      try {
        const restorePayload = await restorePlannerCoachConversation(conversationId);
        const restoredMessages = restorePayload.messages.slice(
          -COACH_SESSION_MAX_MESSAGES
        );
        resetCoachUiState(restoredMessages);
        setCoachInput("");
        saveCoachSession(context.scopeMonth, context.timezone, restoredMessages);
        setSelectedSavedCoachConversationId(restorePayload.conversation.id);
        setSavedCoachConversations((previous) => {
          const remaining = previous.filter(
            (conversation) => conversation.id !== restorePayload.conversation.id
          );
          return [restorePayload.conversation, ...remaining];
        });
        toast.success("Saved coach conversation restored.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Saved conversation could not be restored."
        );
      } finally {
        setCoachConversationRestoring(false);
      }
    },
    [context, resetCoachUiState]
  );

  const startNewCoachConversation = useCallback(() => {
    if (context?.scopeMonth && context?.timezone) {
      sessionStorage.removeItem(buildCoachSessionKey(context.scopeMonth, context.timezone));
    }
    resetCoachUiState([]);
    setCoachInput("");
    setSelectedSavedCoachConversationId("");
    toast.success("Started a new coach conversation.");
  }, [context, resetCoachUiState]);

  const applyCoachProposal = useCallback(async () => {
    if (coachPendingPatches.length === 0) {
      return;
    }
    await applyCoachPatchesToDraft({
      patches: coachPendingPatches,
      source: "manual",
    });
  }, [applyCoachPatchesToDraft, coachPendingPatches]);

  const rejectCoachProposal = useCallback(() => {
    if (coachPendingPatches.length === 0) {
      return;
    }
    appendCoachContextEvent("Rejected coach proposal");
    setCoachPendingPatches([]);
    setCoachUnresolvedQuestions([]);
    setCoachLastProposalMeta(null);
    toast.success("Coach proposal rejected.");
  }, [appendCoachContextEvent, coachPendingPatches.length]);

  const requestCalendarEditsFromCoach = useCallback(() => {
    const goalHint =
      coachFocusGoalIds.length > 0
        ? `Current focus goals: ${coachFocusGoalIds
            .map(
              (goalId) =>
                `${goalId} (${context?.goalTitles?.[goalId] ?? "Untitled goal"})`
            )
            .join(", ")}.`
        : "There are no focus goals in the current planner scope.";
    setCoachInput(
      `Please convert your guidance into concrete calendar intent I can apply now. Make safe assumptions and keep them explicit. ${goalHint} Only use apply_to_goal when the requested activity clearly matches one of those goals; otherwise use needs_goal and do not repurpose an unrelated goal.`.trim()
    );
  }, [coachFocusGoalIds, context]);

  const undoCoachProposal = useCallback(async () => {
    if (!coachUndoSnapshot) {
      return;
    }
    setCoachPolicyApplying(true);
    try {
      await refreshDraftPreview(coachUndoSnapshot.defaultPolicy);
      if (context?.scopeMonth) {
        applyDraftPolicy(context.scopeMonth, coachUndoSnapshot.defaultPolicy);
      }
      appendCoachContextEvent("Undid latest coach draft proposal");
      toast.success("Latest coach draft apply has been undone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Undo failed.");
    } finally {
      setCoachPolicyApplying(false);
    }
  }, [appendCoachContextEvent, applyDraftPolicy, coachUndoSnapshot, context, refreshDraftPreview]);

  const resetForPlannerStateReset = useCallback(() => {
    if (context?.scopeMonth && context?.timezone) {
      sessionStorage.removeItem(buildCoachSessionKey(context.scopeMonth, context.timezone));
    }
    resetCoachUiState([]);
    setCoachInput("");
    setSelectedSavedCoachConversationId("");
  }, [context, resetCoachUiState]);

  const onDraftDiscarded = useCallback(() => {
    setCoachUndoSnapshot(null);
    appendCoachContextEvent("Discarded draft changes");
  }, [appendCoachContextEvent]);

  const canUseCoach = Boolean(context?.capabilities.coachAi && context?.scopeMonth);
  const hasCoachConversationState =
    coachMessages.length > 0 ||
    coachWarnings.length > 0 ||
    coachRecommendations.length > 0 ||
    coachPendingPatches.length > 0 ||
    coachUnresolvedQuestions.length > 0 ||
    coachContextEvents.length > 0 ||
    coachUndoSnapshot !== null ||
    coachLastProposalMeta !== null ||
    coachInput.trim().length > 0;

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
      coachPendingPatches,
      coachUnresolvedQuestions,
      coachPolicyApplying,
      coachLastProposalMeta,
      hasCoachUndoSnapshot: coachUndoSnapshot !== null,
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
      resetForPlannerStateReset,
      onDraftDiscarded,
    },
  };
}
