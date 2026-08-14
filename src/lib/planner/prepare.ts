import { getAnchoredPeriod } from "@/lib/goals/periods";
import type { Goal } from "@/lib/goals/types";
import { createDefaultAssessment } from "@/lib/planner/assessment";
import {
  resolveCanonicalAsOfDate,
  PlannerRouteError,
} from "@/lib/planner/api";
import {
  MAX_HORIZON_MONTHS,
  PLANNER_CONTRACT_VERSION,
  PLANNER_ELIGIBILITY_MODES,
} from "@/lib/planner/contracts/bounds";
import {
  loadPlannerContextPayload,
  loadPlannerPreparationSnapshot,
  type PlannerItemRow,
} from "@/lib/planner/context-loader";
import { getScopeDateRange, nextMonth } from "@/lib/planner/dates";
import { runPlannerKernel } from "@/lib/planner/kernel";
import { postgresErrorMatches } from "@/lib/planner/postgres-errors";
import {
  createDefaultPlannerPolicy,
  plannerPolicySchema,
} from "@/lib/planner/policy";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import type { Json } from "@/lib/supabase/database.types";
import type { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

interface PreparationWindow {
  start: string;
  end: string;
}

interface PreparedItem {
  goal_id: string;
  unit_key: string;
  scheduled_date: string;
  original_scheduled_date: string;
  scheduled_time: string | null;
  locked: boolean;
}

function addMonths(month: string, count: number) {
  let result = month;
  for (let index = 0; index < count; index += 1) {
    result = nextMonth(result);
  }
  return result;
}

function buildPreparationWindows(asOfDate: string) {
  const firstMonth = asOfDate.slice(0, 7);
  const windows: PreparationWindow[] = [];
  for (let offset = 0; offset < MAX_HORIZON_MONTHS; offset += 12) {
    const startMonth = addMonths(firstMonth, offset);
    const monthCount = Math.min(12, MAX_HORIZON_MONTHS - offset);
    const endMonth = addMonths(startMonth, monthCount - 1);
    windows.push({
      start: getScopeDateRange(startMonth).start,
      end: getScopeDateRange(endMonth).end,
    });
  }
  return windows;
}

function itemKey(item: { goal_id: string; unit_key: string }) {
  return `${item.goal_id}\u0000${item.unit_key}`;
}

function isMissingPrepareScheduleRpc(error: {
  code?: string | null;
  message?: string | null;
}) {
  const code = (error.code ?? "").toUpperCase();
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    (message.includes("prepare_planner_schedule") &&
      message.includes("schema cache"))
  );
}

function itemMatchesCurrentRequirement({
  item,
  goal,
  weekStartsOn,
}: {
  item: PlannerItemRow;
  goal: Goal;
  weekStartsOn: number;
}) {
  if (
    item.scheduled_date < goal.start_date ||
    (goal.end_date !== null && item.scheduled_date > goal.end_date)
  ) {
    return false;
  }
  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "milestone_sequence") {
    const match = /^milestone:([1-9][0-9]*)$/.exec(item.unit_key);
    return Boolean(match && Number(match[1]) <= requirement.targetCount);
  }
  if (requirement.kind === "deadline_total") {
    const match = /^total:([1-9][0-9]*)$/.exec(item.unit_key);
    return Boolean(match && Number(match[1]) <= requirement.targetCount);
  }
  const period = getAnchoredPeriod(
    goal.start_date,
    requirement.interval,
    item.scheduled_date,
    { weekStartsOn }
  );
  return item.unit_key === `cadence:${period.periodKey}`;
}

async function fallbackPrepareWithSetSchedule({
  supabase,
  windows,
  preparedItems,
  expectedDigest,
}: {
  supabase: ServerSupabaseClient;
  windows: PreparationWindow[];
  preparedItems: PreparedItem[];
  expectedDigest: string;
}) {
  const itemsByWindow = windows.map((window) =>
    preparedItems.filter(
      (item) =>
        item.scheduled_date >= window.start && item.scheduled_date <= window.end
    )
  );
  let digest = expectedDigest;
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]!;
    const response = await supabase.rpc("set_planner_schedule", {
      p_start: window.start,
      p_end: window.end,
      p_items: itemsByWindow[index]! as unknown as Json,
      p_expected_digest: digest,
    });
    if (response.error) {
      if (postgresErrorMatches(response.error, "P0001", "stale_schedule")) {
        return { stale: true as const };
      }
      throw new PlannerRouteError(
        409,
        "prepare_failed",
        "Planner calendar could not be prepared.",
        { cause: response.error.message }
      );
    }
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (row && typeof row.schedule_digest === "string") {
      digest = row.schedule_digest;
    }
  }
  return { stale: false as const };
}

async function prepareOnce({
  supabase,
  ownerId,
}: {
  supabase: ServerSupabaseClient;
  ownerId: string;
}) {
  const preparation = await loadPlannerPreparationSnapshot({
    supabase,
    ownerId,
  });
  const timezone = preparation.snapshot.preferences?.timezone ?? "UTC";
  const asOfDate = resolveCanonicalAsOfDate({ timezone });
  const policy = plannerPolicySchema.parse(
    preparation.snapshot.preferences?.default_policy ??
      createDefaultPlannerPolicy(timezone, new Date().toISOString())
  );
  const windows = buildPreparationWindows(asOfDate);
  const preparationStart = windows[0]!.start;
  const preparationEnd = windows.at(-1)!.end;
  const goalById = new Map(
    preparation.snapshot.goals.map((goal) => [goal.id, goal])
  );
  const existingByKey = new Map(
    preparation.persistedItems
      .filter(
        (item) =>
          item.scheduled_date >= preparationStart &&
          item.scheduled_date <= preparationEnd
      )
      .filter((item) => {
        const goal = goalById.get(item.goal_id);
        return Boolean(
          goal &&
            itemMatchesCurrentRequirement({
              item,
              goal,
              weekStartsOn: policy.weekStartsOn ?? 1,
            })
        );
      })
      .map((item) => [itemKey(item), item])
  );
  const completionToUnit = {};
  const generatedByKey = new Map<
    string,
    {
      goalId: string;
      unitKey: string;
      scheduledDate: string;
      scheduledTimeOverride: string | null;
      locked: boolean;
    }
  >();

  for (const goal of preparation.snapshot.goals) {
    const requirementFingerprint =
      normalizeGoalRequirement(goal).requirementFingerprint;
    const goalAssignments = preparation.persistedItems
      .filter((item) => item.goal_id === goal.id)
      .map((item) => ({
        goalId: goal.id,
        requirementFingerprint,
        unitKey: item.unit_key,
        scheduledDate: item.scheduled_date,
        locked: item.locked,
        scheduledTimeOverride: item.scheduled_time,
      }));
    for (const window of windows) {
      const kernel = runPlannerKernel({
        schemaVersion: PLANNER_CONTRACT_VERSION,
        eligibilityMode: PLANNER_ELIGIBILITY_MODES[0],
        ownerId,
        startDate: window.start,
        endDate: window.end,
        asOfDate,
        timezone,
        goals: [goal],
        completions: preparation.snapshot.completions.filter(
          (completion) => completion.goal_id === goal.id
        ),
        links: preparation.snapshot.links.filter(
          (link) =>
            link.sourceGoalId === goal.id || link.targetGoalId === goal.id
        ),
        assessments: [createDefaultAssessment(goal)],
        policy,
        basePlan: {
          planId: "planner-preparation",
          version: 1,
          assignments: goalAssignments,
          completionToUnit,
          issueCodes: [],
        },
        preserveExistingAssignments: true,
      });
      if (!kernel.solver.publishable) {
        throw new PlannerRouteError(
          422,
          "planner_not_publishable",
          "Planner preparation could not place every required session.",
          {
            goalId: goal.id,
            issueCodes: kernel.solver.issueCodes,
            invalidGoalIds: kernel.solver.invalidGoalIds,
          }
        );
      }
      for (const unit of kernel.workUnits) {
        if (
          unit.scheduledDate === null ||
          unit.scheduledDate < preparationStart ||
          unit.scheduledDate > preparationEnd
        ) {
          continue;
        }
        generatedByKey.set(
          itemKey({ goal_id: unit.originalGoalId, unit_key: unit.unitKey }),
          {
            goalId: unit.originalGoalId,
            unitKey: unit.unitKey,
            scheduledDate: unit.scheduledDate,
            scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
            locked: unit.locked,
          }
        );
      }
    }
  }

  const preparedByKey = new Map<string, PreparedItem>();
  for (const [key, generated] of generatedByKey) {
    const existing = existingByKey.get(key);
    preparedByKey.set(
      key,
      existing
        ? {
            goal_id: existing.goal_id,
            unit_key: existing.unit_key,
            scheduled_date: existing.scheduled_date,
            original_scheduled_date:
              existing.original_scheduled_date ?? existing.scheduled_date,
            scheduled_time: existing.scheduled_time,
            locked: existing.locked,
          }
        : {
            goal_id: generated.goalId,
            unit_key: generated.unitKey,
            scheduled_date: generated.scheduledDate,
            original_scheduled_date: generated.scheduledDate,
            scheduled_time: generated.scheduledTimeOverride,
            locked: generated.locked,
          }
    );
  }

  const preparedItems = Array.from(preparedByKey.values()).sort(
    (left, right) =>
      left.scheduled_date.localeCompare(right.scheduled_date) ||
      left.goal_id.localeCompare(right.goal_id) ||
      left.unit_key.localeCompare(right.unit_key)
  );
  const occupiedGoalDates = new Set<string>();
  for (const item of preparedItems) {
    const goalDate = `${item.goal_id}\u0000${item.scheduled_date}`;
    if (occupiedGoalDates.has(goalDate)) {
      throw new PlannerRouteError(
        422,
        "planner_not_publishable",
        "Planner preparation produced two sessions for one goal on the same day.",
        {
          goalId: item.goal_id,
          scheduledDate: item.scheduled_date,
        }
      );
    }
    occupiedGoalDates.add(goalDate);
  }

  const windowsPayload = windows.map((window) => ({
    start_date: window.start,
    end_date: window.end,
  })) as unknown as Json;
  const expectedDigest = preparation.snapshot.revisions.scheduleDigest ?? "";
  const response = await supabase.rpc("prepare_planner_schedule", {
    p_windows: windowsPayload,
    p_items: preparedItems as unknown as Json,
    p_expected_digest: expectedDigest,
  });
  if (response.error) {
    if (postgresErrorMatches(response.error, "P0001", "stale_schedule")) {
      return { stale: true as const };
    }
    if (isMissingPrepareScheduleRpc(response.error)) {
      return fallbackPrepareWithSetSchedule({
        supabase,
        windows,
        preparedItems,
        expectedDigest,
      });
    }
    throw new PlannerRouteError(
      409,
      "prepare_failed",
      "Planner calendar could not be prepared.",
      { cause: response.error.message }
    );
  }
  return { stale: false as const };
}

export async function preparePlannerSchedule({
  supabase,
  ownerId,
  capabilities = { crossMonthMovesEnabled: false },
  scopeMonth,
  visibleWindow,
  correlationId,
}: {
  supabase: ServerSupabaseClient;
  ownerId: string;
  capabilities?: { crossMonthMovesEnabled: boolean };
  scopeMonth: string;
  visibleWindow: PreparationWindow;
  correlationId?: string;
}) {
  let result = await prepareOnce({ supabase, ownerId });
  if (result.stale) {
    result = await prepareOnce({ supabase, ownerId });
  }
  if (result.stale) {
    throw new PlannerRouteError(
      409,
      "stale_revision",
      "Planner state changed while the calendar was opening. Try again."
    );
  }
  return loadPlannerContextPayload({
    supabase,
    ownerId,
    capabilities,
    scopeMonth,
    startDate: visibleWindow.start,
    endDate: visibleWindow.end,
    correlationId,
  });
}
