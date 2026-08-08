import { z } from "zod";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import type { createClient as createServerClient } from "@/lib/supabase/server";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const plannerItemExpectationSchema = z
  .object({
    itemId: z.string().uuid(),
    expectedDigest: digestSchema,
  })
  .strict();

export const plannerGoalExpectationSchema = z
  .object({
    expectedDigest: digestSchema,
  })
  .strict();

export const targetedExactDateRequestSchema = z
  .object({
    goalId: z.uuid(),
    date: z.iso.date(),
    desiredFactState: z.enum(["present", "absent"]),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimezone, "Provide a valid IANA timezone."),
    plannerItemExpectation: plannerItemExpectationSchema.optional(),
    plannerGoalExpectation: plannerGoalExpectationSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !(
        value.plannerItemExpectation !== undefined &&
        value.plannerGoalExpectation !== undefined
      ),
    {
      message: "Only one planner expectation can be supplied per request.",
      path: ["plannerGoalExpectation"],
    }
  );

export type PlannerItemExpectation = z.infer<typeof plannerItemExpectationSchema>;
export type PlannerGoalExpectation = z.infer<typeof plannerGoalExpectationSchema>;

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type ExactDateClient = Pick<ServerSupabaseClient, "from" | "rpc">;

interface PlannerExactDateDispatchFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

interface PlannerExactDateDispatchSuccess {
  ok: true;
  payload: {
    goalId: string;
    date: string;
    factState: "present" | "absent";
  };
}

export type PlannerExactDateDispatchResult =
  | PlannerExactDateDispatchFailure
  | PlannerExactDateDispatchSuccess;

interface GoalLifetimeWindow {
  startDate: string;
  endDate: string | null;
}

function dispatchFailure(
  status: number,
  code: string,
  message: string
): PlannerExactDateDispatchFailure {
  return {
    ok: false,
    status,
    code,
    message,
  };
}

function dateOutsideGoalLifetime(date: string, goal: GoalLifetimeWindow) {
  return date < goal.startDate || (goal.endDate !== null && date > goal.endDate);
}

async function ensureExpectedDigest({
  supabase,
  expectedDigest,
}: {
  supabase: ExactDateClient;
  expectedDigest: string;
}) {
  const digestResponse = await supabase.rpc("get_planner_schedule_digest", {});
  if (digestResponse.error) {
    return dispatchFailure(
      503,
      "planner_state_unavailable",
      "Planner completion state could not be loaded."
    );
  }
  const actualDigest =
    typeof digestResponse.data === "string"
      ? digestResponse.data.toLowerCase()
      : null;
  if (!actualDigest || actualDigest !== expectedDigest.toLowerCase()) {
    return dispatchFailure(
      409,
      "stale_revision",
      "Planner completion state is stale. Refresh and try again."
    );
  }
  return null;
}

async function applyDirectCompletionFact({
  supabase,
  ownerId,
  goalId,
  date,
  desiredFactState,
}: {
  supabase: ExactDateClient;
  ownerId: string;
  goalId: string;
  date: string;
  desiredFactState: "present" | "absent";
}) {
  if (desiredFactState === "present") {
    const upsertResponse = await supabase.from("completions").upsert(
      {
        goal_id: goalId,
        user_id: ownerId,
        completed_on: date,
        source: "manual",
      },
      { onConflict: "goal_id,user_id,completed_on", ignoreDuplicates: true }
    );
    return upsertResponse.error;
  }

  const deleteResponse = await supabase
    .from("completions")
    .delete()
    .eq("goal_id", goalId)
    .eq("user_id", ownerId)
    .eq("completed_on", date);
  return deleteResponse.error;
}

export async function applyPlannerItemDateFact({
  supabase,
  ownerId,
  goalId,
  desiredFactState,
  timezone,
  goalLifetime,
  expectation,
}: {
  supabase: ExactDateClient;
  ownerId: string;
  goalId: string;
  desiredFactState: "present" | "absent";
  timezone: string;
  goalLifetime: GoalLifetimeWindow;
  expectation: PlannerItemExpectation;
}): Promise<PlannerExactDateDispatchResult> {
  const digestFailure = await ensureExpectedDigest({
    supabase,
    expectedDigest: expectation.expectedDigest,
  });
  if (digestFailure) {
    return digestFailure;
  }

  const itemResponse = await supabase
    .from("planner_items")
    .select("id, goal_id, scheduled_date")
    .eq("id", expectation.itemId)
    .maybeSingle();

  if (itemResponse.error) {
    return dispatchFailure(
      503,
      "planner_item_lookup_failed",
      "Planner item state could not be loaded."
    );
  }
  const item = itemResponse.data;
  if (!item || item.goal_id !== goalId) {
    return dispatchFailure(
      404,
      "planner_item_not_found",
      "Planner item was not found in the active plan."
    );
  }

  const itemDate = item.scheduled_date;
  if (desiredFactState === "present") {
    const localToday = getDateInTimezone(new Date(), timezone);
    if (itemDate > localToday) {
      return dispatchFailure(
        422,
        "future_completion_not_allowed",
        "Completions can only be added for today or a past date."
      );
    }
    if (dateOutsideGoalLifetime(itemDate, goalLifetime)) {
      return dispatchFailure(
        422,
        "completion_outside_goal_lifetime",
        "The completion date must be within the goal lifetime."
      );
    }
  }

  const mutationError = await applyDirectCompletionFact({
    supabase,
    ownerId,
    goalId,
    date: itemDate,
    desiredFactState,
  });
  if (mutationError) {
    return dispatchFailure(
      409,
      "planner_item_date_fact_failed",
      "Planner item date fact could not be updated."
    );
  }

  return {
    ok: true,
    payload: {
      goalId,
      date: itemDate,
      factState: desiredFactState,
    },
  };
}

export async function applyPlannerGoalDateFact({
  supabase,
  ownerId,
  goalId,
  date,
  desiredFactState,
  timezone,
  goalLifetime,
  expectation,
}: {
  supabase: ExactDateClient;
  ownerId: string;
  goalId: string;
  date: string;
  desiredFactState: "present" | "absent";
  timezone: string;
  goalLifetime: GoalLifetimeWindow;
  expectation: PlannerGoalExpectation;
}): Promise<PlannerExactDateDispatchResult> {
  const digestFailure = await ensureExpectedDigest({
    supabase,
    expectedDigest: expectation.expectedDigest,
  });
  if (digestFailure) {
    return digestFailure;
  }

  const [sourceLinksResponse, targetLinksResponse] = await Promise.all([
    supabase
      .from("goal_links")
      .select("id")
      .eq("source_goal_id", goalId)
      .limit(1),
    supabase
      .from("goal_links")
      .select("id")
      .eq("target_goal_id", goalId)
      .limit(1),
  ]);

  if (sourceLinksResponse.error || targetLinksResponse.error) {
    return dispatchFailure(
      503,
      "planner_goal_lookup_failed",
      "Planner goal state could not be loaded."
    );
  }
  if (
    (sourceLinksResponse.data ?? []).length > 0 ||
    (targetLinksResponse.data ?? []).length > 0
  ) {
    return dispatchFailure(
      422,
      "linked_goal_disallowed",
      "Linked goals cannot be completed through plan-goal date facts."
    );
  }

  if (desiredFactState === "present") {
    const localToday = getDateInTimezone(new Date(), timezone);
    if (date > localToday) {
      return dispatchFailure(
        422,
        "future_completion_not_allowed",
        "Completions can only be added for today or a past date."
      );
    }
    if (dateOutsideGoalLifetime(date, goalLifetime)) {
      return dispatchFailure(
        422,
        "completion_outside_goal_lifetime",
        "The completion date must be within the goal lifetime."
      );
    }
  }

  const mutationError = await applyDirectCompletionFact({
    supabase,
    ownerId,
    goalId,
    date,
    desiredFactState,
  });
  if (mutationError) {
    return dispatchFailure(
      409,
      "planner_goal_date_fact_failed",
      "Planner goal date fact could not be updated."
    );
  }

  return {
    ok: true,
    payload: {
      goalId,
      date,
      factState: desiredFactState,
    },
  };
}
