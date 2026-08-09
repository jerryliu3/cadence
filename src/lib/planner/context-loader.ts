import type { Completion, Goal } from "@/lib/goals/types";
import { createDefaultAssessment } from "@/lib/planner/assessment";
import { PlannerRouteError } from "@/lib/planner/api";
import {
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
} from "@/lib/planner/contracts/bounds";
import { plannerCompletionSchema, plannerGoalSchema } from "@/lib/planner/contracts/kernel-schema";
import type { PlannerCanonicalLink } from "@/lib/planner/fingerprint";
import {
  createDefaultPlannerPolicy,
  plannerPolicySchema,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import {
  parsePlannerProfilePreferencesRow,
  resolvePlannerPreferencesSnapshot,
  type PlannerPreferencesSnapshot,
} from "@/lib/planner/preferences-snapshot";
import type { PlannerCompletionUnitIdentity } from "@/lib/planner/reconciliation";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import type { PlannerIssueCode } from "@/lib/planner/solver/types";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type PlannerItemRow = Database["public"]["Tables"]["planner_items"]["Row"];
const PAGE_SIZE = 1_000;

export interface PlannerRevisionTokens {
  scheduleDigest?: string | null;
}

export interface PlannerActivePlanRow {
  id: string;
  version: number;
  status: "active" | "superseded" | "dismissed";
  timezone: string;
  generation_input_hash: string;
}

export interface PlannerActiveGoalRow {
  id: string;
  goal_id: string;
  original_goal_id: string;
  requirement_fingerprint: string;
  title: string;
  category: string;
  color: string | null;
  start_date: string;
  end_date: string | null;
  assessment_snapshot: ReturnType<typeof createDefaultAssessment>;
  assessment_input_hash: string;
}

export interface PlannerActiveItemRow {
  id: string;
  plan_goal_id: string;
  unit_key: string;
  requirement_kind: "milestone_sequence" | "cadence" | "deadline_total";
  scheduled_date: string | null;
  original_scheduled_date: string | null;
  classification:
    | "fulfilled"
    | "open"
    | "future"
    | "historical_shortfall"
    | "historical_miss"
    | "satisfied_elsewhere";
  credit_state: "uncredited" | "completed_as_scheduled" | "completed_elsewhere";
  locked: boolean;
  revision: number;
  credited_completion_id: string | null;
  credited_completion_date: string | null;
  scheduled_time_override: string | null;
  effective_scheduled_local_time: string | null;
}

export interface ActiveExecutionPlanSnapshot {
  plan: PlannerActivePlanRow;
  policy: PlannerPolicy;
  goals: PlannerActiveGoalRow[];
  days: Array<{ date: string }>;
  items: PlannerActiveItemRow[];
  issues: Array<{ issue_code: PlannerIssueCode }>;
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

function nextScopeMonthDate(scopeMonthDate: string) {
  const [yearText, monthText] = scopeMonthDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new PlannerRouteError(
      400,
      "validation_failed",
      "Provide a valid scope month and optional bounded planner context dates."
    );
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear.toString().padStart(4, "0")}-${nextMonth
    .toString()
    .padStart(2, "0")}-01`;
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
  const scheduleDigestResponse = await supabase.rpc(
    "get_planner_schedule_digest",
    {}
  );
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
  const scheduleDigest =
    scheduleDigestResponse.error
      ? null
      : typeof scheduleDigestResponse.data === "string"
      ? scheduleDigestResponse.data
      : null;
  return {
    scheduleDigest,
  };
}

async function loadPlannerPreferences(
  supabase: ServerSupabaseClient,
  ownerId: string
) {
  const profileResponse = await supabase
    .from("profiles")
    .select(
      "timezone,timezone_confirmed_at,week_starts_on,rest_weekdays,blackout_ranges"
    )
    .eq("id", ownerId)
    .maybeSingle();

  if (profileResponse.error) {
    throw new PlannerRouteError(
      500,
      "preference_load_failed",
      "Planner data could not be loaded.",
      { cause: profileResponse.error.message }
    );
  }
  const profile = profileResponse.data
    ? parsePlannerProfilePreferencesRow(profileResponse.data)
    : null;
  return resolvePlannerPreferencesSnapshot({ profile });
}

async function loadPlannerItemsForScope(
  supabase: ServerSupabaseClient,
  ownerId: string,
  scopeMonth: string
) {
  const scopeMonthDate = toScopeMonthDate(scopeMonth);
  const nextMonthDate = nextScopeMonthDate(scopeMonthDate);
  const itemsResponse = await supabase
    .from("planner_items")
    .select("*")
    .eq("owner_id", ownerId)
    .gte("scheduled_date", scopeMonthDate)
    .lt("scheduled_date", nextMonthDate)
    .order("scheduled_date")
    .order("goal_id")
    .order("unit_key");
  requireTableRead(itemsResponse.error, "active_plan_item_load_failed");
  return (itemsResponse.data ?? []) as PlannerItemRow[];
}

async function loadActivePlanSnapshot(
  scopeMonth: string,
  plannerItems: PlannerItemRow[],
  goals: Goal[],
  completions: Completion[],
  preferences: PlannerPreferencesSnapshot | null
): Promise<ActiveExecutionPlanSnapshot | null> {
  if (plannerItems.length === 0) {
    return null;
  }

  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const completionByGoalDate = new Map<string, Completion>();
  for (const completion of completions) {
    completionByGoalDate.set(
      `${completion.goal_id}:${completion.completed_on}`,
      completion
    );
  }

  const activeGoalByGoalId = new Map<string, PlannerActiveGoalRow>();
  const requirementKindByGoalId = new Map<
    string,
    PlannerActiveItemRow["requirement_kind"]
  >();
  const items: PlannerActiveItemRow[] = [];
  const assignments: PlannerBaseAssignment[] = [];
  const completionToUnit: Record<string, PlannerCompletionUnitIdentity> = {};
  for (const item of plannerItems) {
    const goal = goalById.get(item.goal_id);
    if (!goal) {
      throw new PlannerRouteError(
        500,
        "invariant_failed",
        "Planner item referenced a missing goal.",
        { itemId: item.id, goalId: item.goal_id }
      );
    }
    let activeGoal = activeGoalByGoalId.get(goal.id);
    let requirementKind = requirementKindByGoalId.get(goal.id);
    if (!activeGoal) {
      const normalizedRequirement = normalizeGoalRequirement(goal);
      const assessment = createDefaultAssessment(goal);
      requirementKind = normalizedRequirement.requirement.kind;
      activeGoal = {
        id: goal.id,
        goal_id: goal.id,
        original_goal_id: goal.id,
        requirement_fingerprint: normalizedRequirement.requirementFingerprint,
        title: goal.title,
        category: goal.category,
        color: goal.color,
        start_date: goal.start_date,
        end_date: goal.end_date,
        assessment_snapshot: assessment,
        assessment_input_hash: assessment.assessmentInputHash,
      };
      activeGoalByGoalId.set(goal.id, activeGoal);
      requirementKindByGoalId.set(goal.id, requirementKind);
    }
    if (!requirementKind) {
      continue;
    }
    const completion = completionByGoalDate.get(
      `${goal.id}:${item.scheduled_date}`
    );
    const creditState = completion
      ? "completed_as_scheduled"
      : "uncredited";
    const originalScheduledDate =
      item.original_scheduled_date ?? item.scheduled_date;
    items.push({
      id: item.id,
      plan_goal_id: goal.id,
      unit_key: item.unit_key,
      requirement_kind: requirementKind,
      scheduled_date: item.scheduled_date,
      original_scheduled_date: originalScheduledDate,
      classification: completion ? "fulfilled" : "open",
      credit_state: creditState,
      locked: item.locked,
      revision: 0,
      credited_completion_id: completion?.id ?? null,
      credited_completion_date: completion?.completed_on ?? null,
      scheduled_time_override: item.scheduled_time,
      effective_scheduled_local_time: item.scheduled_time,
    });
    assignments.push({
      goalId: goal.id,
      requirementFingerprint: activeGoal.requirement_fingerprint,
      unitKey: item.unit_key,
      scheduledDate: item.scheduled_date,
      locked: item.locked,
      scheduledTimeOverride: item.scheduled_time,
    });
    if (completion) {
      completionToUnit[completion.id] = {
        goalId: goal.id,
        requirementFingerprint: activeGoal.requirement_fingerprint,
        unitKey: item.unit_key,
        completedOn: completion.completed_on,
      };
    }
  }

  const timezone = preferences?.timezone ?? "UTC";
  const policy = plannerPolicySchema.parse(
    preferences?.default_policy ??
      createDefaultPlannerPolicy(timezone, new Date().toISOString())
  );
  const planId = `planner-items-${scopeMonth}`;

  return {
    plan: {
      id: planId,
      version: 1,
      status: "active",
      timezone,
      generation_input_hash: planId,
    },
    policy,
    goals: Array.from(activeGoalByGoalId.values()).sort(
      (left, right) => left.original_goal_id.localeCompare(right.original_goal_id)
    ),
    days: [],
    items,
    issues: [],
    basePlan: {
      planId,
      version: 1,
      assignments: assignments.sort(
        (left, right) =>
          left.goalId.localeCompare(right.goalId) ||
          left.unitKey.localeCompare(right.unitKey)
      ),
      completionToUnit,
      issueCodes: [],
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
  const [goals, links, revisions, preferences, plannerItems] = await Promise.all([
    loadOwnerGoals(supabase, ownerId),
    loadOwnerLinks(supabase, ownerId),
    loadRevisionTokens(supabase),
    loadPlannerPreferences(supabase, ownerId),
    loadPlannerItemsForScope(supabase, ownerId, scopeMonth),
  ]);
  const completions = await loadOwnerCompletions(
    supabase,
    ownerId,
    goals.map((goal) => goal.id)
  );
  const activePlan = await loadActivePlanSnapshot(
    scopeMonth,
    plannerItems,
    goals,
    completions,
    preferences
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
