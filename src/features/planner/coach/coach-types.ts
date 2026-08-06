import type {
  CalendarTab,
  CoachConversationSummary,
  CoachLastProposalMeta,
  CoachMessage,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
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
  applyDraftPolicy: (scopeMonth: string, policy: PlannerPolicy) => void;
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
  coachPendingPatches: CoachPolicyPatch[];
  coachUnresolvedQuestions: string[];
  coachPolicyApplying: boolean;
  coachLastProposalMeta: CoachLastProposalMeta | null;
  hasCoachUndoSnapshot: boolean;
  hasCoachConversationState: boolean;
}

export interface PlannerCoachActions {
  setCoachInput: (value: string) => void;
  setSelectedSavedCoachConversationId: (value: string) => void;
  sendCoachMessage: () => Promise<void>;
  saveCoachConversation: () => Promise<void>;
  restoreSavedCoachConversation: (conversationId: string) => Promise<void>;
  startNewCoachConversation: () => void;
  applyCoachProposal: () => Promise<void>;
  rejectCoachProposal: () => void;
  requestCalendarEditsFromCoach: () => void;
  undoCoachProposal: () => Promise<void>;
  resetForPlannerStateReset: () => void;
  onDraftDiscarded: () => void;
}

export interface PlannerCoachModel {
  state: PlannerCoachState;
  actions: PlannerCoachActions;
}
