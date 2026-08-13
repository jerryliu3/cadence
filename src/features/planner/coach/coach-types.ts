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
  clearDraftMoveCommands: (entryKeys: string[]) => void;
  applyDraftPolicy: (scopeMonth: string, policy: PlannerPolicy) => void;
  applyCoachSessionMoves?: (
    moves: Array<{ goalId: string; unitKey: string; scheduledDate: string }>
  ) => void;
  getNonPublishablePreviewMessage: (
    preview: NonNullable<PlannerContextPayload["preview"]>
  ) => string;
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
  resetForPlannerStateReset: () => void;
  onDraftDiscarded: () => void;
}

export interface PlannerCoachModel {
  state: PlannerCoachState;
  actions: PlannerCoachActions;
}
