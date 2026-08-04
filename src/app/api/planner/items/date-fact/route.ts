import { z } from "zod";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  plannerWritesNotReleasedError,
  PlannerRouteError,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const itemDateFactSchema = z.object({
  itemId: z.string().uuid(),
  desiredFactState: z.enum(["present", "absent"]),
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
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    await requirePlannerRouteContext({
      supabase,
      requiredCapability: "targetedExactCompletion",
      disabledCode: "targeted_exact_completion_disabled",
      disabledMessage: "Exact-date completion APIs are not enabled for this owner.",
    });
    await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      itemDateFactSchema
    );

    throw plannerWritesNotReleasedError();
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
