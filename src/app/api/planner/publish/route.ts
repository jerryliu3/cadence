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

const publishSchema = z.object({
  scopeMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((month) => {
      const monthNumber = Number(month.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCanonicalRevision: z.number().int().nonnegative(),
  expectedExecutionRevision: z.number().int().nonnegative(),
  expectedBasePlanId: z.string().uuid().nullable(),
  expectedBasePlanVersion: z.number().int().positive().nullable(),
  confirmationHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
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
      Math.min(MAX_API_BODY_BYTES, 256 * 1024),
      publishSchema
    );

    throw plannerWritesNotReleasedError();
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
