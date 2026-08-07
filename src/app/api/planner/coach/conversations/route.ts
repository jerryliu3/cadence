import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coachConversationListQuerySchema,
  coachConversationSaveRequestSchema,
  coachConversationSummarySchema,
} from "@/lib/planner/coach-conversations";
import {
  createCorrelationId,
  parseBoundedJsonBody,
  plannerErrorResponse,
  PlannerRouteError,
  requirePlannerAdminClient,
  requirePlannerRouteContext,
  unknownPlannerErrorResponse,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { callAdminRpc } from "@/lib/supabase/admin-rpc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const conversationSummaryRowSchema = z
  .object({
    conversation_id: z.uuid(),
    scope_month: z.string(),
    timezone: z.string(),
    title: z.string(),
    preview_text: z.string(),
    message_count: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

function mapSummaryRow(row: z.infer<typeof conversationSummaryRowSchema>) {
  return coachConversationSummarySchema.parse({
    id: row.conversation_id,
    scopeMonth: row.scope_month,
    timezone: row.timezone,
    title: row.title,
    previewText: row.preview_text,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "coachAi",
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });
    const parsedQuery = coachConversationListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    if (!parsedQuery.success) {
      throw new PlannerRouteError(
        400,
        "validation_failed",
        "Conversation list query failed validation.",
        { issues: parsedQuery.error.issues }
      );
    }

    const admin = requirePlannerAdminClient();
    const rpcResponse = await callAdminRpc(
      admin,
      "list_planner_coach_conversations_service",
      {
        p_owner: routeContext.userId,
        p_scope_month: parsedQuery.data.scopeMonth,
        p_limit: parsedQuery.data.limit,
      }
    );
    if (rpcResponse.error) {
      throw new PlannerRouteError(
        503,
        "conversation_list_unavailable",
        "Saved coach conversations are temporarily unavailable."
      );
    }
    const rows = z.array(conversationSummaryRowSchema).parse(rpcResponse.data ?? []);
    const conversations = rows.map(mapSummaryRow);
    return NextResponse.json(
      {
        schemaVersion: "1",
        conversations,
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

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
      requiredCapability: "coachAi",
      disabledCode: "planner_coach_disabled",
      disabledMessage: "Planner coach is not enabled.",
    });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      coachConversationSaveRequestSchema
    );
    const admin = requirePlannerAdminClient();
    const rpcResponse = await callAdminRpc(
      admin,
      "save_planner_coach_conversation_service",
      {
        p_owner: routeContext.userId,
        p_scope_month: body.scopeMonth,
        p_timezone: body.timezone,
        p_title: body.title,
        p_messages: body.messages.map((message) => ({
          role: message.role,
          content: message.content,
          proposal: message.proposal ?? null,
        })),
      }
    );
    if (rpcResponse.error) {
      throw new PlannerRouteError(
        503,
        "conversation_save_failed",
        "Coach conversation could not be saved."
      );
    }

    const rows = z.array(conversationSummaryRowSchema).parse(rpcResponse.data ?? []);
    const summary = rows[0];
    if (!summary) {
      throw new PlannerRouteError(
        500,
        "conversation_save_invariant_failed",
        "Conversation save did not return a persisted summary."
      );
    }
    const conversation = mapSummaryRow(summary);
    return NextResponse.json(
      {
        schemaVersion: "1",
        conversation,
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
