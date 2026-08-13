import { z } from "zod";
import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
  requireAuthenticatedRequestContext,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8 * 1024;
const acknowledgeBodySchema = z.object({
  awardId: z.string().uuid(),
});

function xpDisabledResponse(correlationId: string) {
  return Response.json(
    {
      code: "xp_disabled",
      message: "XP is not enabled.",
      correlationId,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

function unavailableResponse(correlationId: string) {
  return Response.json(
    {
      code: "xp_award_acknowledge_unavailable",
      message: "Award acknowledgement is unavailable.",
      correlationId,
    },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  if (!isFeatureEnabled("xpEnabled")) {
    return xpDisabledResponse(correlationId);
  }

  let userId: string;
  let supabase: Awaited<
    ReturnType<typeof requireAuthenticatedRequestContext>
  >["supabase"];
  try {
    ({ userId, supabase } = await requireAuthenticatedRequestContext(request, {
        unauthorizedMessage: "Sign in to acknowledge awards.",
      }));
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return unavailableResponse(correlationId);
  }

  let body: z.infer<typeof acknowledgeBodySchema>;
  try {
    body = await parseJsonBody({
      request,
      maxBytes: MAX_REQUEST_BYTES,
      schema: acknowledgeBodySchema,
    });
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return unavailableResponse(correlationId);
  }

  const rpcResponse = await supabase.rpc("acknowledge_user_award_service", {
    p_user_id: userId,
    p_award_id: body.awardId,
  });

  if (rpcResponse.error) {
    if (rpcResponse.error.message === "award_not_owned") {
      return Response.json(
        {
          code: "award_not_found",
          message: "Award was not found.",
          correlationId,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return unavailableResponse(correlationId);
  }

  if (!rpcResponse.data) {
    return Response.json(
      {
        code: "award_not_found",
        message: "Award was not found.",
        correlationId,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    {
      schemaVersion: "1",
      acknowledged: true,
      correlationId,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
