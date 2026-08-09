"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildCoachSummaryWorkUnits } from "@/features/planner/calendar-entries";
import {
  listPlannerCoachConversations,
  persistPlannerDefaultPolicy,
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
  CoachMessage,
  CoachMessageProposal,
} from "@/features/planner/calendar-surface.types";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { canonicalHash } from "@/lib/planner/canonical";
import {
  buildPlannerDraftSnapshotToken,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";

const MAX_COACH_MESSAGE_CHARACTERS = 12_000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CoachProposalApplyStatus =
  | "not_attempted"
  | "applied"
  | "already_applied"
  | "failed";

interface CoachProposalApplyResult {
  status: CoachProposalApplyStatus;
  appliedDraftSnapshotToken: string | null;
}

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function formatWeekdayList(weekdays: number[]) {
  const labels = dedupeWeekdays(weekdays)
    .map((weekday) => WEEKDAY_NAMES[weekday] ?? null)
    .filter((weekday): weekday is (typeof WEEKDAY_NAMES)[number] => weekday !== null);
  return labels.length > 0 ? labels.join(", ") : "none";
}

function describePolicyPatch(patch: CoachPolicyPatch) {
  switch (patch.kind) {
    case "set_rest_weekdays":
      return `Set rest weekdays to ${formatWeekdayList(patch.restWeekdays)}.`;
    case "add_blackout_range":
      return `Avoid scheduling between ${patch.start} and ${patch.end}.`;
    case "remove_blackout_range":
      return `Remove blackout dates from ${patch.start} to ${patch.end}.`;
  }
}

function describeDraftCommand(command: PlannerDraftCommand) {
  switch (command.kind) {
    case "move_item":
      return `Move ${command.goalId}/${command.unitKey} to ${command.scheduledDate ?? "unscheduled"}.`;
    case "rename_item":
      return `Rename ${command.goalId}/${command.unitKey} to "${command.label ?? "Untitled"}".`;
    case "set_item_time_override":
      return `Set ${command.goalId}/${command.unitKey} time to ${command.localTime}.`;
    case "clear_item_time_override":
      return `Clear time override on ${command.goalId}/${command.unitKey}.`;
  }
}

function clampAssistantMessage(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_COACH_MESSAGE_CHARACTERS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_COACH_MESSAGE_CHARACTERS - 1)}…`;
}

function buildBaselineSnapshotToken(policy: PlannerPolicy) {
  return `policy:${canonicalHash(policy)}`;
}

function buildDraftSnapshotToken(commands: PlannerDraftCommand[]) {
  return buildPlannerDraftSnapshotToken(commands);
}

function buildCombinedProposalSignature({
  policyPatches,
  draftCommands,
}: {
  policyPatches: CoachPolicyPatch[];
  draftCommands: PlannerDraftCommand[];
}) {
  return canonicalHash({
    policyPatches,
    draftCommands: sortPlannerDraftCommands(draftCommands),
  });
}

function buildDurableApplyToastDetail({
  scopeMonth,
  includedDraftPolicyChanges,
}: {
  scopeMonth: string;
  includedDraftPolicyChanges: boolean;
}) {
  const draftNote = includedDraftPolicyChanges
    ? " This save also includes your current draft policy edits."
    : "";
  return `Saved as your default planner policy from ${scopeMonth}.${draftNote} Unpublished months will regenerate as you navigate; already-published months require republish to persist the new rhythm.`;
}

function buildUndoToastMessage({
  shouldPersistDurableUndo,
  scopeMonth,
  hasPolicyEdits,
  hasDraftEdits,
}: {
  shouldPersistDurableUndo: boolean;
  scopeMonth: string | null | undefined;
  hasPolicyEdits: boolean;
  hasDraftEdits: boolean;
}) {
  if (shouldPersistDurableUndo) {
    return scopeMonth
      ? `Coach proposal changes were undone. Planner defaults were restored from ${scopeMonth}.`
      : "Coach proposal changes were undone.";
  }
  if (hasPolicyEdits && hasDraftEdits) {
    return "Coach draft policy and item edits were undone.";
  }
  return hasPolicyEdits
    ? "Coach draft policy changes were undone."
    : "Coach draft item edits were undone.";
}

function mapAutoApplyStatusToProposalStatus(
  status: CoachProposalApplyStatus
): CoachMessageProposal["applyStatus"] {
  if (status === "applied" || status === "already_applied") {
    return "auto_applied";
  }
  return "not_applied";
}

function buildAssistantMessage({
  reply,
  recommendations,
  warnings,
  unresolvedQuestions,
  policyPatches,
  draftCommands,
  autoApplyStatus,
}: {
  reply: string;
  recommendations: string[];
  warnings: string[];
  unresolvedQuestions: string[];
  policyPatches: CoachPolicyPatch[];
  draftCommands: PlannerDraftCommand[];
  autoApplyStatus: CoachProposalApplyStatus;
}) {
  const lines: string[] = [reply.trim()];

  if (recommendations.length > 0) {
    lines.push("", "Recommended next actions:");
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  if (policyPatches.length > 0 || draftCommands.length > 0) {
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
      lines.push(`- ${describePolicyPatch(patch)}`);
    }
    for (const command of draftCommands) {
      lines.push(`- ${describeDraftCommand(command)}`);
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
  effectiveDraftCommands,
  hasDraftSession,
  refreshDraftPreview,
  applyDraftPolicy,
  applyCoachDraftCommands,
  replaceDraftCommands,
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
  const [coachUnresolvedQuestions, setCoachUnresolvedQuestions] = useState<string[]>(
    []
  );
  const [coachPolicyApplying, setCoachPolicyApplying] = useState(false);
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);

  const resetCoachUiState = useCallback((messages: CoachMessage[] = []) => {
    setCoachMessages(messages);
    setCoachWarnings([]);
    setCoachRecommendations([]);
    setCoachUnresolvedQuestions([]);
    setCoachContextEvents([]);
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
        const message =
          error instanceof Error
            ? error.message
            : "Saved conversations could not be loaded.";
        if (
          message
            .toLowerCase()
            .includes("saved coach conversations are temporarily unavailable")
        ) {
          return;
        }
        toast.error(
          message
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
    if (
      activeTab !== "calendar" ||
      !context?.scopeMonth ||
      !context?.capabilities.calendarEnabled
    ) {
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
    context?.capabilities.calendarEnabled,
    context?.scopeMonth,
    loadSavedCoachConversations,
  ]);

  const applyCoachPatchesToDraft = useCallback(
    async ({
      patches,
      draftCommands,
      source,
    }: {
      patches: CoachPolicyPatch[];
      draftCommands: PlannerDraftCommand[];
      source: "auto" | "manual";
    }): Promise<CoachProposalApplyResult> => {
      if (!context?.preferences || (patches.length === 0 && draftCommands.length === 0)) {
        return { status: "not_attempted", appliedDraftSnapshotToken: null };
      }
      const hasPolicyPatches = patches.length > 0;
      const hasDraftCommands = draftCommands.length > 0;

      const priorPolicy = plannerPolicySchema.parse(
        effectiveDraftPolicy ?? context.preferences.defaultPolicy
      );

      let policyResult: ReturnType<typeof applyCoachPolicyPatches> | null = null;
      if (hasPolicyPatches) {
        const allowedGoalIds = new Set<string>([
          ...Object.keys(context.goalTitles ?? {}),
          ...(context.activePlan?.goals ?? []).map((goal) => goal.original_goal_id),
        ]);
        policyResult = applyCoachPolicyPatches({
          policy: priorPolicy,
          patches,
          allowedGoalIds,
        });
      }

      const draftResult = hasDraftCommands
        ? applyCoachDraftCommands(draftCommands)
        : {
            appliedCount: 0,
            rejectedCount: 0,
            rejectionMessages: [] as string[],
            nextDraftSnapshotToken: buildDraftSnapshotToken(effectiveDraftCommands),
          };

      const policyAppliedCount = policyResult?.appliedPatchCount ?? 0;
      const policyNoOpOnly =
        policyResult !== null &&
        policyAppliedCount === 0 &&
        policyResult.noOpPatchCount > 0 &&
        policyResult.outOfScopePatchCount === 0 &&
        policyResult.unsupportedPatchCount === 0;
      const policyHardRejected =
        policyResult !== null &&
        policyAppliedCount === 0 &&
        !policyNoOpOnly &&
        (policyResult.outOfScopePatchCount > 0 ||
          policyResult.unsupportedPatchCount > 0);

      const anyApplied = policyAppliedCount > 0 || draftResult.appliedCount > 0;
      if (!anyApplied) {
        if (
          policyNoOpOnly &&
          draftResult.rejectedCount === 0 &&
          draftResult.appliedCount === 0
        ) {
          appendCoachContextEvent("Coach proposal already matched current draft");
          toast.success(
            hasDraftSession
              ? "Coach proposal already matches your current draft edits."
              : "Coach proposal already matches your current planner state."
          );
          return {
            status: "already_applied",
            appliedDraftSnapshotToken: buildDraftSnapshotToken(effectiveDraftCommands),
          };
        }
        if (policyHardRejected || draftResult.rejectedCount > 0) {
          if (draftResult.rejectionMessages[0]) {
            toast.error(draftResult.rejectionMessages[0]);
          } else {
            toast.error(
              (policyResult?.outOfScopePatchCount ?? 0) > 0
                ? "Coach edits were received but none matched your current goal scope."
                : "No applicable policy changes were available to apply."
            );
          }
          return { status: "failed", appliedDraftSnapshotToken: null };
        }
        return { status: "not_attempted", appliedDraftSnapshotToken: null };
      }

      const shouldRefreshPolicy = policyAppliedCount > 0 && policyResult !== null;
      if (shouldRefreshPolicy) {
        setCoachPolicyApplying(true);
      }
      try {
        let refreshedPreview = effectivePreview;
        let assignmentChanges = 0;
        if (shouldRefreshPolicy && policyResult !== null) {
          refreshedPreview = await refreshDraftPreview(policyResult.policy, "replan");
          if (!refreshedPreview) {
            throw new Error("Preview refresh returned no planner data.");
          }
          if (source === "manual") {
            await persistPlannerDefaultPolicy({
              timezone: context.preferences.timezone,
              defaultPolicy: policyResult.policy,
            });
            appendCoachContextEvent("Persisted coach proposal to planner defaults");
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
          for (const key of new Set([
            ...previousDatesByKey.keys(),
            ...refreshedDatesByKey.keys(),
          ])) {
            if (previousDatesByKey.get(key) !== refreshedDatesByKey.get(key)) {
              assignmentChanges += 1;
            }
          }
          if (context.scopeMonth) {
            applyDraftPolicy(context.scopeMonth, policyResult.policy);
          }
        }

        appendCoachContextEvent(
          source === "auto"
            ? `Auto-applied coach proposal (${policyAppliedCount} policy edits, ${draftResult.appliedCount} item edits)`
            : `Applied coach proposal (${policyAppliedCount} policy edits, ${draftResult.appliedCount} item edits)`
        );

        if (draftResult.rejectedCount > 0) {
          toast.error(
            draftResult.rejectionMessages[0] ??
              `${draftResult.rejectedCount} coach item edit${
                draftResult.rejectedCount === 1 ? " was" : "s were"
              } skipped.`
          );
        }

        if (refreshedPreview && !refreshedPreview.solver.publishable) {
          toast.error(
            `${source === "auto" ? "Coach updates auto-applied" : "Coach proposal applied"}, but this draft cannot publish yet. ${getNonPublishablePreviewMessage(
              refreshedPreview
            )}`
          );
        } else if (shouldRefreshPolicy && assignmentChanges === 0) {
          toast.success(
            `${source === "auto" ? "Coach updates auto-applied" : "Coach proposal applied"}. Policy changed, but scheduled sessions stayed the same.`
          );
        } else {
          const parts: string[] = [];
          if (policyAppliedCount > 0) {
            parts.push(
              `${policyAppliedCount} policy edit${policyAppliedCount === 1 ? "" : "s"}`
            );
          }
          if (draftResult.appliedCount > 0) {
            parts.push(
              `${draftResult.appliedCount} item edit${draftResult.appliedCount === 1 ? "" : "s"}`
            );
          }
          const changeSummary =
            shouldRefreshPolicy && assignmentChanges > 0
              ? ` (${assignmentChanges} session change${assignmentChanges === 1 ? "" : "s"})`
              : "";
          toast.success(
            `${source === "auto" ? "Coach updates auto-applied" : "Coach proposal applied"}${changeSummary}: ${parts.join(" + ")}.`
          );
        }

        if (source === "manual" && context.scopeMonth && shouldRefreshPolicy) {
          toast.success(
            buildDurableApplyToastDetail({
              scopeMonth: context.scopeMonth,
              includedDraftPolicyChanges: hasDraftSession || effectiveDraftPolicy !== null,
            })
          );
        }
        return {
          status: "applied",
          appliedDraftSnapshotToken: draftResult.nextDraftSnapshotToken,
        };
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : source === "auto"
              ? "Coach proposal auto-apply failed."
              : "Coach proposal apply failed."
        );
        return { status: "failed", appliedDraftSnapshotToken: null };
      } finally {
        if (shouldRefreshPolicy) {
          setCoachPolicyApplying(false);
        }
      }
    },
    [
      applyCoachDraftCommands,
      appendCoachContextEvent,
      applyDraftPolicy,
      context,
      effectiveDraftCommands,
      effectiveDraftPolicy,
      effectivePreview,
      getNonPublishablePreviewMessage,
      hasDraftSession,
      refreshDraftPreview,
    ]
  );

  const sendCoachMessage = useCallback(async () => {
    if (
      !context?.capabilities.calendarEnabled ||
      !context.scopeMonth ||
      !context.timezone
    ) {
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
      horizonSummary: effectivePreview?.horizonSummary ?? [],
      focusGoalIds: coachFocusGoalIds,
      goalTitles: context.goalTitles,
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
      const draftCommands = coachPayload.proposal?.draftCommands ?? [];
      let autoApplyResult: CoachProposalApplyResult = {
        status: "not_attempted",
        appliedDraftSnapshotToken: null,
      };
      const baselinePolicy = context.preferences
        ? plannerPolicySchema.parse(effectiveDraftPolicy ?? context.preferences.defaultPolicy)
        : null;
      const baselineDraftCommands = sortPlannerDraftCommands(effectiveDraftCommands);
      let proposal: CoachMessageProposal | null = null;
      if (policyPatches.length > 0 || draftCommands.length > 0) {
        autoApplyResult = await applyCoachPatchesToDraft({
          patches: policyPatches,
          draftCommands,
          source: "auto",
        });
        const patchSignature = buildCombinedProposalSignature({
          policyPatches,
          draftCommands,
        });
        proposal = {
          schemaVersion: "1",
          applyStatus: mapAutoApplyStatusToProposalStatus(autoApplyResult.status),
          patchSignature,
          baselineSnapshotToken: baselinePolicy
            ? buildBaselineSnapshotToken(baselinePolicy)
            : `missing:${patchSignature.slice(0, 32)}`,
          baselinePolicy,
          baselineDraftSnapshotToken: buildDraftSnapshotToken(baselineDraftCommands),
          baselineDraftCommands,
          expectedAppliedDraftSnapshotToken:
            autoApplyResult.appliedDraftSnapshotToken,
          policyPatches,
          draftCommands,
          unresolvedQuestions,
        };
      }
      const assistantMessage: CoachMessage = {
        role: "assistant",
        content: buildAssistantMessage({
          reply: coachPayload.reply,
          recommendations,
          warnings,
          unresolvedQuestions,
          policyPatches,
          draftCommands,
          autoApplyStatus: autoApplyResult.status,
        }),
        createdAt: Date.now(),
        proposal,
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
    effectiveDraftCommands,
    effectiveDraftPolicy,
    effectivePreview?.horizonSummary,
    persistCoachMessages,
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
        persistCoachMessages(restoredMessages);
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
    [context, persistCoachMessages, resetCoachUiState]
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

  const updateCoachProposalStatus = useCallback(
    (
      messageIndex: number,
      applyStatus: CoachMessageProposal["applyStatus"],
      overrides: Partial<CoachMessageProposal> = {}
    ) => {
      setCoachMessages((previous) => {
        const target = previous[messageIndex];
        if (!target || target.role !== "assistant" || !target.proposal) {
          return previous;
        }
        const nextMessages = previous.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                proposal: {
                  ...message.proposal!,
                  applyStatus,
                  ...overrides,
                },
              }
            : message
        );
        persistCoachMessages(nextMessages);
        return nextMessages;
      });
    },
    [persistCoachMessages]
  );

  const applyCoachProposal = useCallback(
    async (messageIndex: number) => {
      const message = coachMessages[messageIndex];
      if (!message || message.role !== "assistant" || !message.proposal) {
        return;
      }
      const applyResult = await applyCoachPatchesToDraft({
        patches: message.proposal.policyPatches,
        draftCommands: message.proposal.draftCommands ?? [],
        source: "manual",
      });
      if (applyResult.status === "applied") {
        updateCoachProposalStatus(messageIndex, "manually_applied", {
          expectedAppliedDraftSnapshotToken: applyResult.appliedDraftSnapshotToken,
        });
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
      `Please convert your guidance into concrete calendar intent I can apply now. Make safe assumptions and keep them explicit. ${goalHint} Use action="apply" for concrete scheduling edits. Include global policy edits when needed and per-item edits when you can map to an existing goalId + unitKey; use action="needs_goal" when the request cannot be represented by those planner fields.`.trim()
    );
  }, [coachFocusGoalIds, context]);

  const undoCoachProposal = useCallback(
    async (messageIndex: number) => {
      const message = coachMessages[messageIndex];
      if (!message || message.role !== "assistant" || !message.proposal) {
        return;
      }
      const hasPolicyEdits = message.proposal.policyPatches.length > 0;
      const proposalDraftCommands = message.proposal.draftCommands ?? [];
      const hasDraftEdits = proposalDraftCommands.length > 0;
      if (!hasPolicyEdits && !hasDraftEdits) {
        toast.error("This coach proposal did not contain undoable edits.");
        return;
      }

      if (hasDraftEdits) {
        const expectedAppliedDraftSnapshotToken =
          message.proposal.expectedAppliedDraftSnapshotToken;
        if (!expectedAppliedDraftSnapshotToken) {
          toast.error(
            "Undo is unavailable because this proposal has no applied draft snapshot."
          );
          return;
        }
        if (
          buildDraftSnapshotToken(effectiveDraftCommands) !==
          expectedAppliedDraftSnapshotToken
        ) {
          toast.error(
            "Undo is blocked because newer draft item edits were applied after this proposal. Undo newer proposals first or discard draft edits."
          );
          return;
        }
      }

      let baselinePolicy: PlannerPolicy | null = null;
      let currentDraftPolicy: PlannerPolicy | null = null;
      if (hasPolicyEdits) {
        if (!context?.preferences) {
          toast.error("Undo is unavailable because planner policy is not loaded.");
          return;
        }
        if (!message.proposal.baselinePolicy) {
          toast.error(
            "Undo is unavailable because this proposal has no baseline policy snapshot."
          );
          return;
        }
        baselinePolicy = plannerPolicySchema.parse(message.proposal.baselinePolicy);
        const allowedGoalIds = new Set<string>([
          ...Object.keys(context.goalTitles ?? {}),
          ...(context.activePlan?.goals ?? []).map((goal) => goal.original_goal_id),
        ]);
        const expectedAppliedPolicy = applyCoachPolicyPatches({
          policy: baselinePolicy,
          patches: message.proposal.policyPatches,
          allowedGoalIds,
        }).policy;
        currentDraftPolicy = plannerPolicySchema.parse(
          effectiveDraftPolicy ?? context.preferences.defaultPolicy
        );
        if (
          buildBaselineSnapshotToken(currentDraftPolicy) !==
          buildBaselineSnapshotToken(expectedAppliedPolicy)
        ) {
          toast.error(
            "Undo is blocked because newer draft policy changes were applied after this proposal. Undo newer proposals first or discard draft changes."
          );
          return;
        }
      }

      const shouldPersistDurableUndo =
        hasPolicyEdits && message.proposal.applyStatus === "manually_applied";
      if (hasPolicyEdits) {
        setCoachPolicyApplying(true);
      }
      try {
        if (hasPolicyEdits && baselinePolicy) {
          await refreshDraftPreview(baselinePolicy, "stable");
          if (shouldPersistDurableUndo && context?.preferences) {
            try {
              await persistPlannerDefaultPolicy({
                timezone: context.preferences.timezone,
                defaultPolicy: baselinePolicy,
              });
            } catch (error) {
              try {
                if (currentDraftPolicy) {
                  await refreshDraftPreview(currentDraftPolicy, "stable");
                  if (context.scopeMonth) {
                    applyDraftPolicy(context.scopeMonth, currentDraftPolicy);
                  }
                }
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
          if (context?.scopeMonth) {
            applyDraftPolicy(context.scopeMonth, baselinePolicy);
          }
        }
        if (hasDraftEdits) {
          replaceDraftCommands(
            sortPlannerDraftCommands(message.proposal.baselineDraftCommands ?? [])
          );
        }
        updateCoachProposalStatus(messageIndex, "undone", {
          expectedAppliedDraftSnapshotToken: buildDraftSnapshotToken(
            sortPlannerDraftCommands(message.proposal.baselineDraftCommands ?? [])
          ),
        });
        appendCoachContextEvent("Undid coach draft proposal");
        toast.success(
          buildUndoToastMessage({
            shouldPersistDurableUndo,
            scopeMonth: context?.scopeMonth,
            hasPolicyEdits,
            hasDraftEdits,
          })
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Undo failed.");
      } finally {
        if (hasPolicyEdits) {
          setCoachPolicyApplying(false);
        }
      }
    },
    [
      appendCoachContextEvent,
      applyDraftPolicy,
      coachMessages,
      context,
      effectiveDraftCommands,
      effectiveDraftPolicy,
      replaceDraftCommands,
      refreshDraftPreview,
      updateCoachProposalStatus,
    ]
  );

  const resetForPlannerStateReset = useCallback(() => {
    if (context?.scopeMonth && context?.timezone) {
      sessionStorage.removeItem(buildCoachSessionKey(context.scopeMonth, context.timezone));
    }
    resetCoachUiState([]);
    setCoachInput("");
    setSelectedSavedCoachConversationId("");
  }, [context, resetCoachUiState]);

  const onDraftDiscarded = useCallback(() => {
    setCoachMessages((previous) => {
      let changed = false;
      const nextMessages = previous.map((message) => {
        if (
          message.proposal &&
          (message.proposal.applyStatus === "auto_applied" ||
            message.proposal.applyStatus === "manually_applied")
        ) {
          changed = true;
          const nextProposal: CoachMessageProposal = {
            ...message.proposal,
            applyStatus: "undone",
          };
          return {
            ...message,
            proposal: nextProposal,
          };
        }
        return message;
      });
      if (changed) {
        persistCoachMessages(nextMessages);
      }
      return changed ? nextMessages : previous;
    });
    appendCoachContextEvent("Discarded draft changes");
  }, [appendCoachContextEvent, persistCoachMessages]);

  const canUseCoach = Boolean(
    context?.capabilities.calendarEnabled && context?.scopeMonth
  );
  const hasCoachConversationState =
    coachMessages.length > 0 ||
    coachWarnings.length > 0 ||
    coachRecommendations.length > 0 ||
    coachUnresolvedQuestions.length > 0 ||
    coachContextEvents.length > 0 ||
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
      coachUnresolvedQuestions,
      coachPolicyApplying,
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
