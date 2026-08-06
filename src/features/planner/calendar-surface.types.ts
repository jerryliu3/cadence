import type { CoachPolicyPatch } from "@/lib/planner/coach";
import type { PlannerPolicy } from "@/lib/planner/policy";

export type CalendarTab = "today" | "not-today" | "calendar";

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
    plannerRead: boolean;
    plannerGeneration: boolean;
    plannerPlanWrites: boolean;
    targetedExactCompletion: boolean;
    coachAi: boolean;
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
    generationInputHash: string;
    solver: {
      placementStatus: "complete" | "partial";
      searchStatus:
        | "all_units_placed"
        | "maximum_partial"
        | "blocked_invalid_lock"
        | "soft_optimization_exhausted";
      issueCodes: string[];
      confirmationRequired: boolean;
    };
    workUnits: PlannerWorkUnit[];
  } | null;
  revisions: {
    canonicalRevision: number;
    executionRevision: number;
  };
  staleness: {
    stale: boolean;
    reasons: Array<{ code: string }>;
  };
}

export interface PlannerWorkUnit {
  originalGoalId: string;
  unitKey: string;
  kind?: "milestone_sequence" | "cadence" | "deadline_total";
  label: string | null;
  scheduledDate: string | null;
  placementWindow?: {
    start: string;
    end: string;
  } | null;
  restEligible?: boolean;
  classification: string;
  creditState: string;
  creditedCompletionDate?: string | null;
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
  classification: string;
  credit_state: string;
  locked: boolean;
  revision: number;
  credited_completion_id: string | null;
  credited_completion_date: string | null;
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
}

export interface PlannerCompletionFactMarker {
  key: string;
  originalGoalId: string;
  unitKey: string;
  goalTitle: string;
  scheduledDate: string | null;
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
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  onCloseDay: () => void;
  onPlannerMutation: () => void;
}

export type CoachMessageRole = "user" | "assistant";

export interface CoachMessage {
  role: CoachMessageRole;
  content: string;
  createdAt: number;
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

export interface CoachLastProposalMeta {
  policyPatchCount: number;
}

export type CompletionControlDisabledReason =
  | "future_creation"
  | "satisfied_elsewhere"
  | "out_of_scope_route"
  | "unsupported";

