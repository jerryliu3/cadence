import type { Completion, Goal } from "@/lib/goals/types";
import {
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
} from "@/lib/planner/contracts/bounds";
import { plannerCompletionSchema, plannerGoalSchema } from "@/lib/planner/contracts/kernel-schema";
import type { PlannerCanonicalLink } from "@/lib/planner/fingerprint";
import { PlannerRouteError } from "@/lib/planner/api";
import { plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";
import type { PlannerIssueCode } from "@/lib/planner/solver/types";
import type {
  ExecutionPlanDayRow,
  ExecutionPlanGoalRow,
  ExecutionPlanIssueRow,
  ExecutionPlanItemRow,
  ExecutionPlanRow,
} from "@/lib/planner/persistence-types";
import {
  parsePlannerLegacyPreferencesRow,
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
  type PlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import type { PlannerCompletionUnitIdentity } from "@/lib/planner/reconciliation";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
const PAGE_SIZE = 1_000;
const allowedIssueCodes = new Set<PlannerIssueCode>([
  "placement_shortfall",
  "invalid_lock",
  "soft_optimization_exhausted",
  "historical_miss",
  "historical_shortfall",
]);

export interface PlannerRevisionTokens {
  canonicalRevision: number;
  executionRevision: number;
  scheduleDigest?: string | null;
}

export interface ActiveExecutionPlanSnapshot {
  plan: ExecutionPlanRow;
  policy: PlannerPolicy;
  goals: ExecutionPlanGoalRow[];
  days: ExecutionPlanDayRow[];
  items: ExecutionPlanItemRow[];
  issues: ExecutionPlanIssueRow[];
  basePlan: {
    planId: string;
    version: number;
    assignments: PlannerBaseAssignment[];
    completionToUnit: Record<string, PlannerCompletionUnitIdentity>;
    issueCodes: PlannerIssueCode[];
  };
}

export interface PlannerCanonicalSnapshot {
  goals: Goal[];
  completions: Completion[];
  links: PlannerCanonicalLink[];
  revisions: PlannerRevisionTokens;
  preferences: PlannerPreferencesSnapshot | null;
  activePlan: ActiveExecutionPlanSnapshot | null;
}

function toScopeMonthDate(scopeMonth: string) {
  return `${scopeMonth}-01`;
}

function requireTableRead(error: { message: string } | null, code: string) {
  if (error) {
    throw new PlannerRouteError(
      500,
      code,
      "Planner data could not be loaded.",
      { cause: error.message }
    );
  }
}

async function loadOwnerGoals(
  supabase: ServerSupabaseClient,
  ownerId: string
) {
  const goals: Goal[] = [];
  let lastGoalId: string | null = null;
  for (;;) {
    let query = supabase
      .from("goals")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_group", false)
      .eq("is_deleted", false)
      .order("id")
      .limit(PAGE_SIZE);
    if (lastGoalId) {
      query = query.gt("id", lastGoalId);
    }
    const response = await query;
    requireTableRead(response.error, "goal_load_failed");
    const page = plannerGoalSchema.array().parse(response.data ?? []);
    goals.push(...page);
    if (goals.length > MAX_ELIGIBLE_GOALS) {
      throw new PlannerRouteError(
        413,
        "plan_too_large",
        "Planner goal bounds were exceeded.",
        { dimension: "eligible goals", maximum: MAX_ELIGIBLE_GOALS }
      );
    }
    if (page.length < PAGE_SIZE) {
      break;
    }
    lastGoalId = page.at(-1)?.id ?? null;
  }
  return goals;
}

async function loadOwnerCompletions(
  supabase: ServerSupabaseClient,
  ownerId: string,
  goalIds: string[]
) {
  if (goalIds.length === 0) {
    return [] as Completion[];
  }

  const completions: Completion[] = [];
  let lastCompletionId: string | null = null;
  for (;;) {
    let query = supabase
      .from("completions")
      .select("*")
      .eq("user_id", ownerId)
      .in("goal_id", goalIds)
      .order("id")
      .limit(PAGE_SIZE);
    if (lastCompletionId) {
      query = query.gt("id", lastCompletionId);
    }
    const response = await query;
    requireTableRead(response.error, "completion_load_failed");
    const page = plannerCompletionSchema.array().parse(response.data ?? []);
    completions.push(...page);
    if (completions.length > MAX_COMPLETION_FACTS) {
      throw new PlannerRouteError(
        413,
        "plan_too_large",
        "Planner completion bounds were exceeded.",
        { dimension: "completion facts", maximum: MAX_COMPLETION_FACTS }
      );
    }
    if (page.length < PAGE_SIZE) {
      break;
    }
    lastCompletionId = page.at(-1)?.id ?? null;
  }

  return completions;
}

async function loadOwnerLinks(
  supabase: ServerSupabaseClient,
  ownerId: string
) {
  const links: PlannerCanonicalLink[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = supabase
      .from("goal_links")
      .select("id, source_goal_id, target_goal_id")
      .eq("owner_id", ownerId)
      .order("id")
      .limit(PAGE_SIZE);
    if (lastId) {
      query = query.gt("id", lastId);
    }
    const response = await query;
    requireTableRead(response.error, "link_load_failed");
    const page = (response.data ??
      []) as Array<{ id: string; source_goal_id: string; target_goal_id: string }>;
    links.push(
      ...page.map((link) => ({
        sourceGoalId: link.source_goal_id,
        targetGoalId: link.target_goal_id,
      }))
    );
    if (page.length < PAGE_SIZE) {
      break;
    }
    lastId = page.at(-1)?.id ?? null;
  }
  return links;
}

async function loadRevisionTokens(
  supabase: ServerSupabaseClient
): Promise<PlannerRevisionTokens> {
  const [revisionResponse, scheduleDigestResponse] = await Promise.all([
    supabase.rpc("get_planner_state"),
    supabase.rpc("get_planner_schedule_digest", {}),
  ]);
  requireTableRead(revisionResponse.error, "revision_load_failed");
  if (scheduleDigestResponse.error) {
    const digestErrorCode = (scheduleDigestResponse.error.code ?? "").toUpperCase();
    const digestErrorMessage = scheduleDigestResponse.error.message.toLowerCase();
    const missingDigestFunction =
      digestErrorCode === "42883" ||
      digestErrorCode === "PGRST202" ||
      digestErrorMessage.includes("does not exist") ||
      digestErrorMessage.includes("schema cache");
    if (!missingDigestFunction) {
      requireTableRead(scheduleDigestResponse.error, "revision_load_failed");
    }
  }
  const row = (
    (revisionResponse.data as
      | Array<{ canonical_revision: number; execution_revision: number }>
      | null) ?? []
  )[0];
  const scheduleDigest =
    scheduleDigestResponse.error
      ? null
      : typeof scheduleDigestResponse.data === "string"
      ? scheduleDigestResponse.data
      : null;
  return {
    canonicalRevision: row?.canonical_revision ?? 0,
    executionRevision: row?.execution_revision ?? 0,
    scheduleDigest,
  };
}

async function loadPlannerPreferences(
  supabase: ServerSupabaseClient,
  ownerId: string
) {
  const [profileResponse, legacyResponse] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
      )
      .eq("id", ownerId)
      .maybeSingle(),
    supabase
      .from("planner_preferences")
      .select("timezone,timezone_confirmed_at,policy_revision,default_policy")
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);

  if (profileResponse.error) {
    const code = (profileResponse.error.code ?? "").toUpperCase();
    if (code !== "42P01" && code !== "42703" && code !== "PGRST204") {
      throw new PlannerRouteError(
        500,
        "preference_load_failed",
        "Planner data could not be loaded.",
        { cause: profileResponse.error.message }
      );
    }
  }
  if (legacyResponse.error) {
    const code = (legacyResponse.error.code ?? "").toUpperCase();
    if (code !== "42P01" && code !== "PGRST205") {
      throw new PlannerRouteError(
        500,
        "preference_load_failed",
        "Planner data could not be loaded.",
        { cause: legacyResponse.error.message }
      );
    }
  }

  const profile = profileResponse.data
    ? parsePlannerProfilePreferencesRow(profileResponse.data)
    : null;
  const legacy = legacyResponse.data
    ? parsePlannerLegacyPreferencesRow(legacyResponse.data)
    : null;
  return resolvePlannerPreferencesSnapshot({ profile, legacy });
}

async function loadActivePlanSnapshot(
  supabase: ServerSupabaseClient,
  ownerId: string,
  scopeMonth: string
): Promise<ActiveExecutionPlanSnapshot | null> {
  const scopeMonthDate = toScopeMonthDate(scopeMonth);
  const activePlanResponse = await supabase
    .from("execution_plans")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("scope_month", scopeMonthDate)
    .eq("status", "active")
    .maybeSingle();
  requireTableRead(activePlanResponse.error, "active_plan_load_failed");
  const plan = (activePlanResponse.data as ExecutionPlanRow | null) ?? null;
  if (!plan) {
    return null;
  }

  const [goalsResponse, daysResponse, itemsResponse, issuesResponse] =
    await Promise.all([
      supabase
        .from("execution_plan_goals")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("owner_id", ownerId)
        .order("original_goal_id")
        .order("id"),
      supabase
        .from("execution_plan_days")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("owner_id", ownerId)
        .order("date"),
      supabase
        .from("execution_plan_items")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("owner_id", ownerId)
        .order("ordinal")
        .order("unit_key"),
      supabase
        .from("execution_plan_issues")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("owner_id", ownerId)
        .order("created_at"),
    ]);
  requireTableRead(goalsResponse.error, "active_plan_goal_load_failed");
  requireTableRead(daysResponse.error, "active_plan_day_load_failed");
  requireTableRead(itemsResponse.error, "active_plan_item_load_failed");
  requireTableRead(issuesResponse.error, "active_plan_issue_load_failed");

  const goals = (goalsResponse.data ?? []) as ExecutionPlanGoalRow[];
  const days = (daysResponse.data ?? []) as ExecutionPlanDayRow[];
  const items = (itemsResponse.data ?? []) as ExecutionPlanItemRow[];
  const issues = (issuesResponse.data ?? []) as ExecutionPlanIssueRow[];
  const policy = plannerPolicySchema.parse(plan.policy_snapshot);
  const goalByPlanGoalId = new Map(goals.map((goal) => [goal.id, goal]));
  const assignments: PlannerBaseAssignment[] = [];
  const completionToUnit: Record<string, PlannerCompletionUnitIdentity> = {};
  for (const item of items) {
    const planGoal = goalByPlanGoalId.get(item.plan_goal_id);
    if (!planGoal) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Execution plan item referenced a missing plan goal.",
        { itemId: item.id, planGoalId: item.plan_goal_id }
      );
    }
    assignments.push({
      goalId: planGoal.original_goal_id,
      requirementFingerprint: planGoal.requirement_fingerprint,
      unitKey: item.unit_key,
      scheduledDate: item.scheduled_date,
      locked: item.locked,
      scheduledTimeOverride: item.scheduled_time_override,
    });
    if (item.credited_completion_id && item.credited_completion_date) {
      completionToUnit[item.credited_completion_id] = {
        goalId: planGoal.original_goal_id,
        requirementFingerprint: planGoal.requirement_fingerprint,
        unitKey: item.unit_key,
        completedOn: item.credited_completion_date,
      };
    }
  }

  const issueCodes = Array.from(
    new Set(
      issues
        .map((issue) => issue.issue_code)
        .filter((issueCode): issueCode is PlannerIssueCode =>
          allowedIssueCodes.has(issueCode as PlannerIssueCode)
        )
    )
  ).sort();

  return {
    plan,
    policy,
    goals,
    days,
    items,
    issues,
    basePlan: {
      planId: plan.id,
      version: plan.version,
      assignments: assignments.sort(
        (left, right) =>
          left.goalId.localeCompare(right.goalId) ||
          left.unitKey.localeCompare(right.unitKey)
      ),
      completionToUnit,
      issueCodes,
    },
  };
}

export async function loadPlannerCanonicalSnapshot({
  supabase,
  ownerId,
  scopeMonth,
}: {
  supabase: ServerSupabaseClient;
  ownerId: string;
  scopeMonth: string;
}): Promise<PlannerCanonicalSnapshot> {
  const [goals, links, revisions, preferences, activePlan] = await Promise.all([
    loadOwnerGoals(supabase, ownerId),
    loadOwnerLinks(supabase, ownerId),
    loadRevisionTokens(supabase),
    loadPlannerPreferences(supabase, ownerId),
    loadActivePlanSnapshot(supabase, ownerId, scopeMonth),
  ]);
  const completions = await loadOwnerCompletions(
    supabase,
    ownerId,
    goals.map((goal) => goal.id)
  );

  return {
    goals,
    completions,
    links,
    revisions,
    preferences,
    activePlan,
  };
}
