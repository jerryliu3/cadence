import { NextResponse } from "next/server";
import { z } from "zod";
import { coachConversationSummarySchema } from "@/lib/planner/coach-conversations";
import {
  createCorrelationId,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const routeParamsSchema = z
  .object({
    conversationId: z.uuid(),
  })
  .strict();

const conversationMessageRowSchema = z
  .object({
    conversation_id: z.uuid(),
    scope_month: z.string(),
    timezone: z.string(),
    title: z.string(),
    preview_text: z.string(),
    message_count: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
    message_ordinal: z.number().int(),
    message_role: z.enum(["user", "assistant"]),
    message_content: z.string(),
    message_created_at: z.string(),
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
      requiredCapability: "coachAi",
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });
    const admin = requirePlannerAdminClient();
    const rpcResponse = await callAdminRpc(
      admin,
      "get_planner_coach_conversation_service",
      {
        p_owner: routeContext.userId,
        p_conversation_id: params.conversationId,
      }
    );
    if (rpcResponse.error) {
      throw new PlannerRouteError(
        503,
        "conversation_restore_unavailable",
        "Saved coach conversation could not be loaded."
      );
    }
    const rows = z.array(conversationMessageRowSchema).parse(rpcResponse.data ?? []);
    if (rows.length === 0) {
      throw new PlannerRouteError(
        404,
        "conversation_not_found",
        "The requested coach conversation was not found."
      );
    }
    const head = rows[0];
    const conversation = coachConversationSummarySchema.parse({
      id: head.conversation_id,
      scopeMonth: head.scope_month,
      timezone: head.timezone,
      title: head.title,
      previewText: head.preview_text,
      messageCount: head.message_count,
      createdAt: head.created_at,
      updatedAt: head.updated_at,
    });
    const messages = rows.map((row, index) => ({
      role: row.message_role,
      content: row.message_content,
      createdAt: Number.isFinite(Date.parse(row.message_created_at))
        ? Date.parse(row.message_created_at)
        : Date.now() + index,
    }));

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
