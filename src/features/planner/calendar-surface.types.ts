import type { CoachPolicyPatch } from "@/lib/planner/coach";
import type { PlannerDraftVisualKind } from "@/lib/planner/diff";
import type { PlannerPolicy } from "@/lib/planner/policy";
import type {
  PlannerActiveGoalSnapshot,
  PlannerActiveItemSnapshot,
  PlannerCompletionFactMarker,
} from "@cadence/shared/planner/context";
import type {
  PlannerCalendarViewMode,
  PlannerShellTab,
} from "@cadence/shared/planner/calendar-state";

export type {
  DraftItemEdit,
  PlannerActiveGoalSnapshot,
  PlannerActiveItemSnapshot,
  PlannerCompletionFactMarker,
  PlannerContextPayload,
  PlannerErrorPayload,
  PlannerGoalHorizonSummary,
  PlannerPreferencesPayload,
  PlannerPreviewResponsePayload,
  PlannerVisibleMonthContextPayload,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";
export type { PlannerCalendarViewMode };
export type CalendarTab = PlannerShellTab;

export interface PlannerDayDetailEntry {
  key: string;
  originalGoalId: string;
  goalTitle: string | null;
  unitKey: string;
  label: string | null;
  classification: string;
  creditState: string;
  activeGoal: PlannerActiveGoalSnapshot | null;
  activeItem: PlannerActiveItemSnapshot | null;
  draftDiffKind: PlannerDraftVisualKind | null;
  draftDiffFromDate: string | null;
  draftDiffToDate: string | null;
  draftGhost: boolean;
  goalDefaultLocalTime?: string | null;
  scheduledTimeOverride?: string | null;
  effectiveScheduledLocalTime?: string | null;
}

export interface DayPreviewState {
  day: string;
  pinned: boolean;
  position: {
    top: number;
    left: number;
    width: number;
    placement: "above" | "below";
  };
}

export interface CalendarSurfaceProps {
  activeTab: CalendarTab;
  month: string | null;
  selectedDay: string | null;
  viewMode: PlannerCalendarViewMode;
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  onViewModeChange: (
    viewMode: PlannerCalendarViewMode,
    mode: "push" | "replace"
  ) => void;
  onSelectedDayChange: (
    day: string | null,
    mode: "push" | "replace",
    nextViewMode?: PlannerCalendarViewMode
  ) => void;
  onPlannerMutation: () => void;
  duoScope?: "me" | "partner" | "both";
  partnerCompletionMarkersByDate?: Map<string, PlannerCompletionFactMarker[]>;
  partnerOverlayError?: string | null;
}

export type CoachMessageRole = "user" | "assistant";

export type CoachProposalApplyStatus =
  | "not_applied"
  | "auto_applied"
  | "manually_applied"
  | "undone";

export interface CoachMessageProposal {
  schemaVersion: "1";
  applyStatus: CoachProposalApplyStatus;
  patchSignature: string;
  baselineSnapshotToken: string;
  baselinePolicy: PlannerPolicy | null;
  policyPatches: CoachPolicyPatch[];
  /**
   * Draft `move_item` pins this proposal created. Undo removes exactly these,
   * so reverting a coach change also reverts the schedule it caused.
   */
  appliedMoveEntryKeys?: string[];
  unresolvedQuestions: string[];
}

export interface CoachMessage {
  role: CoachMessageRole;
  content: string;
  createdAt: number;
  proposal?: CoachMessageProposal | null;
}

export interface CoachConversationSummary {
  id: string;
  scopeMonth: string;
  timezone: string;
  title: string;
  previewText: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoachConversationListPayload {
  schemaVersion: "1";
  conversations: CoachConversationSummary[];
  correlationId?: string;
}

export interface CoachConversationDetailPayload {
  schemaVersion: "1";
  conversation: CoachConversationSummary;
  messages: CoachMessage[];
  correlationId?: string;
}

export interface CoachResponsePayload {
  schemaVersion: "1";
  phase: "discovery" | "review" | "ready" | "explain";
  reply: string;
  proposal?: {
    policyPatches?: CoachPolicyPatch[];
    unresolvedQuestions?: string[];
  };
  warnings?: string[];
  recommendations?: Array<{ text: string }>;
}

export type CompletionControlDisabledReason =
  | "future_creation"
  | "satisfied_elsewhere"
  | "out_of_scope_route"
  | "unsupported";
