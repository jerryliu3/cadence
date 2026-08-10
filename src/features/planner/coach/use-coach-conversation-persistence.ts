"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listPlannerCoachConversations,
  restorePlannerCoachConversation,
  savePlannerCoachConversation,
} from "@/features/planner/coach/coach-client";
import {
  clearPersistedCoachSession,
  isTemporarilyUnavailableSavedConversationError,
  resolveSavedConversationSelection,
} from "@/features/planner/coach/coach-state-utils";
import { upsertConversationSummary } from "@/features/planner/coach/coach-message-state";
import {
  COACH_SESSION_MAX_MESSAGES,
  loadCoachSession,
} from "@/features/planner/coach-session";
import type {
  PlannerCoachModel,
  UsePlannerCoachArgs,
} from "@/features/planner/coach/coach-types";
import type { CoachMessage } from "@/features/planner/calendar-surface.types";

interface UseCoachConversationPersistenceArgs {
  activeTab: UsePlannerCoachArgs["activeTab"];
  scopeMonth: string | null | undefined;
  timezone: string | null | undefined;
  coachMessages: CoachMessage[];
  resetCoachUiState: (messages?: CoachMessage[]) => void;
  setCoachInput: (value: string) => void;
  persistCoachMessages: (messages: CoachMessage[]) => void;
}

interface UseCoachConversationPersistenceResult {
  state: Pick<
    PlannerCoachModel["state"],
    | "savedCoachConversations"
    | "selectedSavedCoachConversationId"
    | "coachConversationsLoading"
    | "coachConversationSaving"
    | "coachConversationRestoring"
  >;
  actions: Pick<
    PlannerCoachModel["actions"],
    | "setSelectedSavedCoachConversationId"
    | "saveCoachConversation"
    | "restoreSavedCoachConversation"
    | "startNewCoachConversation"
    | "resetForPlannerStateReset"
  >;
}

export function useCoachConversationPersistence({
  activeTab,
  scopeMonth,
  timezone,
  coachMessages,
  resetCoachUiState,
  setCoachInput,
  persistCoachMessages,
}: UseCoachConversationPersistenceArgs): UseCoachConversationPersistenceResult {
  const [savedCoachConversations, setSavedCoachConversations] = useState<
    PlannerCoachModel["state"]["savedCoachConversations"]
  >([]);
  const [selectedSavedCoachConversationId, setSelectedSavedCoachConversationId] =
    useState("");
  const [coachConversationsLoading, setCoachConversationsLoading] = useState(false);
  const [coachConversationSaving, setCoachConversationSaving] = useState(false);
  const [coachConversationRestoring, setCoachConversationRestoring] = useState(false);

  const loadSavedCoachConversations = useCallback(async (loadScopeMonth: string) => {
    setCoachConversationsLoading(true);
    try {
      const conversations = await listPlannerCoachConversations({ scopeMonth: loadScopeMonth, limit: 20 });
      setSavedCoachConversations(conversations);
      setSelectedSavedCoachConversationId((current) =>
        resolveSavedConversationSelection({
          currentId: current,
          conversations,
        })
      );
    } catch (error) {
      setSavedCoachConversations([]);
      setSelectedSavedCoachConversationId("");
      const message =
        error instanceof Error ? error.message : "Saved conversations could not be loaded.";
      if (isTemporarilyUnavailableSavedConversationError(message)) {
        return;
      }
      toast.error(message);
    } finally {
      setCoachConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "calendar" || !scopeMonth || !timezone) {
      return;
    }
    const timer = window.setTimeout(() => {
      const restored = loadCoachSession(scopeMonth, timezone);
      resetCoachUiState(restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, resetCoachUiState, scopeMonth, timezone]);

  useEffect(() => {
    if (activeTab !== "calendar" || !scopeMonth) {
      const timer = window.setTimeout(() => {
        setSavedCoachConversations([]);
        setSelectedSavedCoachConversationId("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void loadSavedCoachConversations(scopeMonth);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadSavedCoachConversations, scopeMonth]);

  const saveCoachConversation = useCallback(async () => {
    if (!scopeMonth || !timezone || coachMessages.length === 0) {
      return;
    }
    setCoachConversationSaving(true);
    try {
      const conversation = await savePlannerCoachConversation({
        scopeMonth,
        timezone,
        messages: coachMessages,
      });
      setSavedCoachConversations((previous) =>
        upsertConversationSummary({ previous, conversation })
      );
      setSelectedSavedCoachConversationId(conversation.id);
      toast.success("Coach conversation saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Coach conversation could not be saved."
      );
    } finally {
      setCoachConversationSaving(false);
    }
  }, [coachMessages, scopeMonth, timezone]);

  const restoreSavedCoachConversation = useCallback(
    async (conversationId: string) => {
      if (!scopeMonth || !timezone || !conversationId) {
        return;
      }
      setCoachConversationRestoring(true);
      try {
        const restorePayload = await restorePlannerCoachConversation(conversationId);
        const restoredMessages = restorePayload.messages.slice(-COACH_SESSION_MAX_MESSAGES);
        resetCoachUiState(restoredMessages);
        setCoachInput("");
        persistCoachMessages(restoredMessages);
        setSelectedSavedCoachConversationId(restorePayload.conversation.id);
        setSavedCoachConversations((previous) =>
          upsertConversationSummary({
            previous,
            conversation: restorePayload.conversation,
          })
        );
        toast.success("Saved coach conversation restored.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Saved conversation could not be restored."
        );
      } finally {
        setCoachConversationRestoring(false);
      }
    },
    [persistCoachMessages, resetCoachUiState, scopeMonth, setCoachInput, timezone]
  );

  const clearConversationState = useCallback(
    (showToast: boolean) => {
      clearPersistedCoachSession({
        scopeMonth: scopeMonth ?? undefined,
        timezone: timezone ?? undefined,
      });
      resetCoachUiState([]);
      setCoachInput("");
      setSelectedSavedCoachConversationId("");
      if (showToast) {
        toast.success("Started a new coach conversation.");
      }
    },
    [resetCoachUiState, scopeMonth, setCoachInput, timezone]
  );

  const startNewCoachConversation = useCallback(() => {
    clearConversationState(true);
  }, [clearConversationState]);

  const resetForPlannerStateReset = useCallback(() => {
    clearConversationState(false);
  }, [clearConversationState]);

  return {
    state: {
      savedCoachConversations,
      selectedSavedCoachConversationId,
      coachConversationsLoading,
      coachConversationSaving,
      coachConversationRestoring,
    },
    actions: {
      setSelectedSavedCoachConversationId,
      saveCoachConversation,
      restoreSavedCoachConversation,
      startNewCoachConversation,
      resetForPlannerStateReset,
    },
  };
}
