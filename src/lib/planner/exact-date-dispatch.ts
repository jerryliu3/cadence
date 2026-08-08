import { z } from "zod";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import { requirePlannerAdminClient } from "@/lib/planner/api";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";

export const plannerItemExpectationSchema = z
  .object({
    itemId: z.string().uuid(),
    expectedCreditedUnit: z
      .object({
        goalId: z.string().min(1).max(100),
        requirementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        unitKey: z.string().min(1).max(100),
        completedOn: z.iso.date(),
      })
      .nullable(),
    expectedCanonicalRevision: z.number().int().nonnegative(),
    expectedExecutionRevision: z.number().int().nonnegative(),
    expectedItemRevision: z.number().int().nonnegative(),
  })
  .strict();

export const plannerGoalExpectationSchema = z
  .object({
    planGoalId: z.string().uuid(),
    expectedCanonicalRevision: z.number().int().nonnegative(),
    expectedExecutionRevision: z.number().int().nonnegative(),
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

export async function applyPlannerItemDateFact({
  ownerId,
  fallbackGoalId,
  fallbackDate,
  desiredFactState,
  expectation,
}: {
  ownerId: string;
  fallbackGoalId: string;
  fallbackDate: string;
  desiredFactState: "present" | "absent";
  expectation: PlannerItemExpectation;
}): Promise<PlannerExactDateDispatchResult> {
  const admin = requirePlannerAdminClient();
  const response = await callAdminRpc(
    admin,
    "set_execution_plan_item_date_fact_service",
    {
      p_owner: ownerId,
      p_item_id: expectation.itemId,
      p_desired_fact_state: desiredFactState,
      p_expected_credited_unit: expectation.expectedCreditedUnit,
      p_expected_canonical_revision: expectation.expectedCanonicalRevision,
      p_expected_execution_revision: expectation.expectedExecutionRevision,
      p_expected_item_revision: expectation.expectedItemRevision,
    }
  );
  if (response.error) {
    const message = response.error.message.toLowerCase();
    if (
      message.includes("planner revision mismatch") ||
      message.includes("planner item revision mismatch") ||
      message.includes("credited unit mismatch")
    ) {
      return dispatchFailure(
        409,
        "stale_revision",
        "Planner completion state is stale. Refresh and try again."
      );
    }
    if (message.includes("future_completion_not_allowed")) {
      return dispatchFailure(
        422,
        "future_completion_not_allowed",
        "Completions can only be added for today or a past date."
      );
    }
    if (message.includes("item state cannot accept exact-date facts")) {
      return dispatchFailure(
        422,
        "item_date_fact_disallowed",
        "This item state cannot be updated with exact-date completion facts."
      );
    }
    if (message.includes("active planner item not found")) {
      return dispatchFailure(
        404,
        "planner_item_not_found",
        "Planner item was not found in the active plan."
      );
    }
    return dispatchFailure(
      409,
      "planner_item_date_fact_failed",
      "Planner item date fact could not be updated."
    );
  }

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row) {
    return dispatchFailure(
      500,
      "invariant_failed",
      "Planner item date fact did not return updated state."
    );
  }

  return {
    ok: true,
    payload: {
      goalId:
        typeof row.goal_id === "string" ? row.goal_id : fallbackGoalId,
      date: typeof row.date === "string" ? row.date : fallbackDate,
      factState: row.fact_state as "present" | "absent",
    },
  };
}

export async function applyPlannerGoalDateFact({
  ownerId,
  fallbackGoalId,
  fallbackDate,
  desiredFactState,
  expectation,
}: {
  ownerId: string;
  fallbackGoalId: string;
  fallbackDate: string;
  desiredFactState: "present" | "absent";
  expectation: PlannerGoalExpectation;
}): Promise<PlannerExactDateDispatchResult> {
  const admin = requirePlannerAdminClient();
  const response = await callAdminRpc(
    admin,
    "set_execution_plan_goal_date_fact_service",
    {
      p_owner: ownerId,
      p_plan_goal_id: expectation.planGoalId,
      p_date: fallbackDate,
      p_desired_fact_state: desiredFactState,
      p_expected_canonical_revision: expectation.expectedCanonicalRevision,
      p_expected_execution_revision: expectation.expectedExecutionRevision,
    }
  );
  if (response.error) {
    const message = response.error.message.toLowerCase();
    if (message.includes("planner revision mismatch")) {
      return dispatchFailure(
        409,
        "stale_revision",
        "Planner completion state is stale. Refresh and try again."
      );
    }
    if (message.includes("future_completion_not_allowed")) {
      return dispatchFailure(
        422,
        "future_completion_not_allowed",
        "Completions can only be added for today or a past date."
      );
    }
    if (message.includes("completion_outside_goal_lifetime")) {
      return dispatchFailure(
        422,
        "completion_outside_goal_lifetime",
        "The completion date must be within the goal lifetime."
      );
    }
    if (
      message.includes("linked goals cannot use planner plan-goal date facts")
    ) {
      return dispatchFailure(
        422,
        "linked_goal_disallowed",
        "Linked goals cannot be completed through plan-goal date facts."
      );
    }
    if (message.includes("active planner goal not found")) {
      return dispatchFailure(
        404,
        "planner_goal_not_found",
        "Planner goal was not found in the active plan."
      );
    }
    return dispatchFailure(
      409,
      "planner_goal_date_fact_failed",
      "Planner goal date fact could not be updated."
    );
  }

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row) {
    return dispatchFailure(
      500,
      "invariant_failed",
      "Planner goal date fact did not return updated state."
    );
  }

  return {
    ok: true,
    payload: {
      goalId:
        typeof row.goal_id === "string" ? row.goal_id : fallbackGoalId,
      date: typeof row.date === "string" ? row.date : fallbackDate,
      factState: row.fact_state as "present" | "absent",
    },
  };
}
