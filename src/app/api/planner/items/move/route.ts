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

const moveSchema = z.object({
  itemId: z.string().uuid(),
  date: z.iso.date(),
  expectedItemRevision: z.number().int().nonnegative(),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    await requirePlannerRouteContext({
      supabase,
      requiredCapability: "plannerPlanWrites",
      disabledCode: "planner_plan_writes_disabled",
      disabledMessage: "Planner write APIs are not enabled for this owner.",
    });
    await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      moveSchema
    );

    throw plannerWritesNotReleasedError();
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
