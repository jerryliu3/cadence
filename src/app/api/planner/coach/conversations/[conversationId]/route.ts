import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coachConversationMessageTableRowSchema,
  coachConversationSummaryTableRowSchema,
  mapCoachConversationMessageRow,
  mapCoachConversationSummaryRow,
} from "@/lib/planner/coach-conversations";
import {
  createCorrelationId,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const routeParamsSchema = z
  .object({
    conversationId: z.uuid(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> | { conversationId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = routeParamsSchema.parse(await context.params);
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });

    const [conversationResponse, messageResponse] = await Promise.all([
      routeContext.supabase
        .from("planner_coach_conversations")
        .select("id,scope_month,timezone,title,preview_text,message_count,created_at,updated_at")
        .eq("id", params.conversationId)
        .eq("owner_id", routeContext.userId)
        .maybeSingle(),
      routeContext.supabase
        .from("planner_coach_conversation_messages")
        .select("ordinal,role,content,created_at,proposal_meta")
        .eq("conversation_id", params.conversationId)
        .eq("owner_id", routeContext.userId)
        .order("ordinal"),
    ]);

    if (conversationResponse.error || messageResponse.error) {
      const cause = conversationResponse.error?.message ?? messageResponse.error?.message;
      throw new PlannerRouteError(
        503,
        "conversation_restore_unavailable",
        "Saved coach conversation could not be loaded.",
        { cause }
      );
    }
    if (!conversationResponse.data) {
      throw new PlannerRouteError(
        404,
        "conversation_not_found",
        "The requested coach conversation was not found."
      );
    }
    const summaryRow = coachConversationSummaryTableRowSchema.parse(
      conversationResponse.data
    );
    const rows = z
      .array(coachConversationMessageTableRowSchema)
      .parse(messageResponse.data ?? []);
    if (rows.length === 0) {
      throw new PlannerRouteError(
        404,
        "conversation_not_found",
        "The requested coach conversation was not found."
      );
    }
    const conversation = mapCoachConversationSummaryRow(summaryRow);
    const messages = rows.map(mapCoachConversationMessageRow);

    return NextResponse.json(
      {
        schemaVersion: "1",
        conversation,
        messages,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof PlannerRouteError) {
      return plannerErrorResponse(error, correlationId);
    }
    return unknownPlannerErrorResponse(correlationId);
  }
}
