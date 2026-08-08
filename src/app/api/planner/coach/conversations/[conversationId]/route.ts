import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coachConversationMessageSchema,
  coachConversationProposalSchema,
  coachConversationSummarySchema,
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

const conversationMessageRowSchema = z
  .object({
    message_ordinal: z.number().int(),
    message_role: z.enum(["user", "assistant"]),
    message_content: z.string(),
    message_created_at: z.string(),
    message_proposal_meta: z.unknown().nullable().optional(),
  })
  .strict();

const conversationSummaryRowSchema = z
  .object({
    id: z.uuid(),
    scope_month: z.string(),
    timezone: z.string(),
    title: z.string(),
    preview_text: z.string(),
    message_count: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

function parseProposalMeta(raw: unknown) {
  if (raw === null || raw === undefined) {
    return null;
  }
  const parsed = coachConversationProposalSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

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
    const summaryRow = conversationSummaryRowSchema.parse(conversationResponse.data);
    const rows = z
      .array(conversationMessageRowSchema)
      .parse(
        (messageResponse.data ?? []).map((row) => ({
          message_ordinal: row.ordinal,
          message_role: row.role,
          message_content: row.content,
          message_created_at: row.created_at,
          message_proposal_meta: row.proposal_meta,
        }))
      );
    if (rows.length === 0) {
      throw new PlannerRouteError(
        404,
        "conversation_not_found",
        "The requested coach conversation was not found."
      );
    }
    const conversation = coachConversationSummarySchema.parse({
      id: summaryRow.id,
      scopeMonth: summaryRow.scope_month,
      timezone: summaryRow.timezone,
      title: summaryRow.title,
      previewText: summaryRow.preview_text,
      messageCount: summaryRow.message_count,
      createdAt: summaryRow.created_at,
      updatedAt: summaryRow.updated_at,
    });
    const messages = rows.map((row, index) => {
      const parsedProposal =
        row.message_role === "assistant"
          ? parseProposalMeta(row.message_proposal_meta)
          : null;
      return coachConversationMessageSchema.parse({
        role: row.message_role,
        content: row.message_content,
        createdAt: Number.isFinite(Date.parse(row.message_created_at))
          ? Date.parse(row.message_created_at)
          : Date.now() + index,
        proposal: parsedProposal ?? undefined,
      });
    });

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
