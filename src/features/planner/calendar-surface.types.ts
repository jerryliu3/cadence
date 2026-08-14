import type { CoachPolicyPatch } from "@/lib/planner/coach";
import type { PlannerEligibilityMode } from "@/lib/planner/contracts/bounds";
import type { PlannerDraftVisualKind } from "@/lib/planner/diff";
import type { EligibilityReason } from "@/lib/planner/eligibility";
import type { PlannerPolicy } from "@/lib/planner/policy";

export type CalendarTab = "today" | "not-today" | "calendar";
export type PlannerCalendarViewMode = "month" | "week" | "three_day" | "day";

export interface PlannerContextPayload {
  schemaVersion: "1";
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goalTitles: Record<string, string>;
  preferences: {
    timezone: string;
    timezoneConfirmedAt: string;
    policyRevision: number;
    defaultPolicy: PlannerPolicy;
  } | null;
  capabilities: {
    crossMonthMovesEnabled: boolean;
  };
  activePlan: {
    plan: {
      id: string;
      version: number;
      status: "active" | "superseded" | "dismissed";
    };
    goals: PlannerActiveGoalSnapshot[];
    items: PlannerActiveItemSnapshot[];
  } | null;
  preview: {
    eligibilityMode: PlannerEligibilityMode;
    preserveExistingAssignments: boolean;
    generationInputHash: string;
    solver: {
      placementStatus: "complete" | "partial";
      searchStatus:
        | "all_units_placed"
        | "maximum_partial"
        | "blocked_invalid_lock";
      capacityStatus: "unverified";
      issueCodes: string[];
      invalidGoalIds: string[];
      publishable: boolean;
      confirmationRequired: boolean;
    };
    workUnits: PlannerWorkUnit[];
    eligibility?: Array<{
      goalId: string;
      eligible: boolean;
      reason: EligibilityReason;
    }>;
    horizonSummary?: PlannerGoalHorizonSummary[];
  } | null;
  revisions: {
    canonicalRevision: number;
    executionRevision: number;
    scheduleDigest?: string | null;
  };
  staleness: {
    stale: boolean;
    reasons: Array<{ code: string }>;
  };
}

export interface PlannerWorkUnit {
  originalGoalId: string;
  requirementFingerprint?: string;
  unitKey: string;
  kind?: "milestone_sequence" | "cadence" | "deadline_total";
  label: string | null;
  scheduledDate: string | null;
  creditWindow?: {
    start: string;
    end: string;
  };
  placementWindow?: {
    start: string;
    end: string;
  } | null;
  draftMoveWindow?: {
    start: string;
    end: string;
  } | null;
  restEligible?: boolean;
  missPolicy?: "roll_forward" | "remain_missed";
  classification: string;
  creditState: string;
  creditedCompletionDate?: string | null;
  goalDefaultLocalTime?: string | null;
  scheduledTimeOverride?: string | null;
  effectiveScheduledLocalTime?: string | null;
  effectiveScheduledAtLocal?: string | null;
  locked?: boolean;
}

export interface PlannerGoalHorizonSummary {
  goalId: string;
  kind: "milestone_sequence" | "deadline_total";
  totalCount: number;
  creditedCount: number;
  remainingCount: number;
  windowPlannedCount: number;
  months: Array<{
    month: string;
    plannedCount: number;
  }>;
}

export interface PlannerActiveGoalSnapshot {
  id: string;
  goal_id: string | null;
  original_goal_id: string;
  requirement_fingerprint: string;
  title: string;
  category: string;
  color: string | null;
}

export interface PlannerActiveItemSnapshot {
  id: string;
  plan_goal_id: string;
  unit_key: string;
  requirement_kind: "milestone_sequence" | "cadence" | "deadline_total";
  scheduled_date: string | null;
  original_scheduled_date?: string | null;
  classification: string;
  credit_state: string;
  locked: boolean;
  revision: number;
  credited_completion_id: string | null;
  credited_completion_date: string | null;
  scheduled_time_override?: string | null;
  effective_scheduled_local_time?: string | null;
}

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

export interface PlannerCompletionFactMarker {
  key: string;
  originalGoalId: string;
  unitKey: string;
  goalTitle: string;
  scheduledDate: string | null;
  owner?: "viewer" | "partner";
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

export interface PlannerErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface DraftItemEdit {
  scheduledDate?: string | null;
  label?: string | null;
  scheduledTimeOverride?: string | null;
}

export interface PlannerPreviewResponsePayload {
  preview: PlannerContextPayload["preview"];
}

export interface PlannerPreferencesPayload {
  schemaVersion: "1";
  preferences: {
    timezone: string;
    timezoneConfirmedAt: string;
    policyRevision: number;
    defaultPolicy: PlannerPolicy;
  } | null;
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

