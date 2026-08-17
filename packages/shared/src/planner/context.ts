export interface PlannerPolicySnapshot {
  schemaVersion: "1";
  timezone: string;
  timezoneConfirmedAt: string;
  weekStartsOn?: number;
  restWeekdays: number[];
  blackoutRanges: Array<{ start: string; end: string }>;
}

export type PlannerEligibilityMode = "overlap_v1";

export type EligibilityReason =
  | "eligible"
  | "not_owner"
  | "deleted"
  | "archived"
  | "linked_target"
  | "invalid_date_range"
  | "end_outside_scope"
  | "starts_after_scope"
  | "horizon_too_long";

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
  start_date?: string;
  end_date?: string | null;
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

export interface PlannerContextPayload {
  schemaVersion: "1";
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goalTitles: Record<string, string>;
  links: PlannerGoalLinkSummary[];
  preferences: {
    timezone: string;
    timezoneConfirmedAt: string;
    policyRevision: number;
    defaultPolicy: PlannerPolicySnapshot;
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
  unplaceableGoals?: Array<{
    goalId: string;
    requirementFingerprint: string;
    policyRevision: number;
    lockSignature: string;
    effectiveSpanEnd: string;
    unplacedCount: number;
    reason: "capacity" | "invalid_lock";
    computedAt?: string;
  }>;
}

export interface PlannerGoalLinkSummary {
  sourceGoalId: string;
  targetGoalId: string;
  sourcePlannedEndDate?: string | null;
  targetSuppressionKind?: "none" | "until" | "indefinite";
  targetResumesOn?: string | null;
}

export interface PlannerVisibleMonthContextPayload {
  scopeMonth: string;
  goalTitles: Record<string, string>;
  activePlan: PlannerContextPayload["activePlan"];
  preview: PlannerContextPayload["preview"];
}

export interface PlannerCompletionFactMarker {
  key: string;
  originalGoalId: string;
  unitKey: string;
  goalTitle: string;
  scheduledDate: string | null;
  owner?: "viewer" | "partner";
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
    defaultPolicy: PlannerPolicySnapshot;
  } | null;
}
