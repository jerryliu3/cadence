import type { SetStateAction } from "react";
import type { BulkGoalDraft } from "@/features/goals/bulk-goal-drafts";
import type {
  CalendarTab,
  CoachConversationSummary,
  CoachMessage,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerPolicy } from "@/lib/planner/policy";

export interface UsePlannerCoachArgs {
  activeTab: CalendarTab;
  context: PlannerContextPayload | null;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  effectivePreview: PlannerContextPayload["preview"] | null;
  effectiveDraftPolicy: PlannerPolicy | null;
  hasDraftSession: boolean;
  refreshDraftPreview: (
    nextPolicy: PlannerPolicy
  ) => Promise<PlannerContextPayload["preview"]>;
  applyPolicyReplanMoves: (
    nextPolicy: PlannerPolicy
  ) => Promise<{ moveCount: number; movedEntryKeys: string[] }>;
  queueDraftMoveCommand: (args: {
    entry: PlannerDayDetailEntry;
    nextDate: string;
    source: "date_input" | "drag_drop" | "coach";
  }) => boolean;
  clearDraftMoveCommands: (entryKeys: string[]) => void;
  applyDraftPolicy: (policy: PlannerPolicy) => void;
  onGoalsCreated: () => Promise<void>;
  coachWindow: { start: string; end: string } | null;
  getNonPublishablePreviewMessage: (
    preview: NonNullable<PlannerContextPayload["preview"]>
  ) => string;
}

export interface CoachGoalDraftRuntimeState {
  status: "loading" | "ready" | "saving" | "created" | "error";
  drafts: BulkGoalDraft[];
  warnings: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface PlannerCoachState {
  canUseCoach: boolean;
  coachLoading: boolean;
  coachInput: string;
  coachMessages: CoachMessage[];
  savedCoachConversations: CoachConversationSummary[];
  selectedSavedCoachConversationId: string;
  coachConversationsLoading: boolean;
  coachConversationSaving: boolean;
  coachConversationRestoring: boolean;
  coachWarnings: string[];
  coachRecommendations: string[];
  coachUnresolvedQuestions: string[];
  coachPolicyApplying: boolean;
  coachGoalDraftStates: Record<number, CoachGoalDraftRuntimeState>;
  hasPendingCalendarEdits: boolean;
  coachGoalRefreshStatus: "idle" | "refreshing" | "failed";
  coachGoalRefreshError: string | null;
  hasCoachConversationState: boolean;
}

export interface PlannerCoachActions {
  setCoachInput: (value: string) => void;
  setSelectedSavedCoachConversationId: (value: string) => void;
  sendCoachMessage: () => Promise<void>;
  saveCoachConversation: () => Promise<void>;
  restoreSavedCoachConversation: (conversationId: string) => Promise<void>;
  startNewCoachConversation: () => void;
  applyCoachProposal: (messageIndex: number) => Promise<void>;
  rejectCoachProposal: () => void;
  requestCalendarEditsFromCoach: () => void;
  undoCoachProposal: (messageIndex: number) => Promise<void>;
  generateCoachGoalDrafts: (messageIndex: number) => Promise<void>;
  createCoachGoalDrafts: (messageIndex: number) => Promise<void>;
  setCoachGoalDrafts: (
    messageIndex: number,
    drafts: SetStateAction<BulkGoalDraft[]>
  ) => void;
  retryCoachGoalRefresh: () => Promise<void>;
  resetForPlannerStateReset: () => void;
  onDraftDiscarded: () => void;
}

export interface PlannerCoachModel {
  state: PlannerCoachState;
  actions: PlannerCoachActions;
}
