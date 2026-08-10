import { NextResponse } from "next/server";
import { z } from "zod";
import {
  coachConversationListQuerySchema,
  coachConversationSummaryTableRowSchema,
  coachConversationSaveRequestSchema,
  mapCoachConversationSummaryRow,
} from "@/lib/planner/coach-conversations";
import {
  parseBoundedJsonBody,
  PlannerRouteError,
  requirePlannerRouteContext,
  withPlannerRoute,
} from "@/lib/planner/api";
import { MAX_API_BODY_BYTES } from "@/lib/planner/contracts/bounds";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CoachConversationSaveBody = z.infer<typeof coachConversationSaveRequestSchema>;

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function deriveConversationTitle(body: CoachConversationSaveBody) {
  const explicitTitle = body.title?.trim();
  if (explicitTitle) {
    return truncateText(explicitTitle, 120);
  }
  const firstUserMessage = body.messages.find(
    (message) => message.role === "user"
  );
  if (firstUserMessage) {
    return truncateText(firstUserMessage.content.trim(), 120);
  }
  return truncateText(body.messages[0]?.content.trim() ?? "Coach conversation", 120);
}

function deriveConversationPreview(
  body: CoachConversationSaveBody,
  fallbackTitle: string
) {
  const latestAssistantMessage = [...body.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (latestAssistantMessage) {
    return truncateText(latestAssistantMessage.content.trim(), 180);
  }
  return truncateText(fallbackTitle, 180);
}

export async function GET(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
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

    let query = routeContext.supabase
      .from("planner_coach_conversations")
      .select("id,scope_month,timezone,title,preview_text,message_count,created_at,updated_at")
      .eq("owner_id", routeContext.userId)
      .order("updated_at", { ascending: false })
      .limit(parsedQuery.data.limit);
    if (parsedQuery.data.scopeMonth) {
      query = query.eq("scope_month", parsedQuery.data.scopeMonth);
    }
    const listResponse = await query;
    if (listResponse.error) {
      throw new PlannerRouteError(
        503,
        "conversation_list_unavailable",
        "Saved coach conversations are temporarily unavailable.",
        { cause: listResponse.error.message }
      );
    }
    const rows = z
      .array(coachConversationSummaryTableRowSchema)
      .parse(listResponse.data ?? []);
    const conversations = rows.map(mapCoachConversationSummaryRow);
    return NextResponse.json(
      {
        schemaVersion: "1",
        conversations,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}

export async function POST(request: Request) {
  return withPlannerRoute(async ({ correlationId }) => {
    const supabase = await createClient();
    const routeContext = await requirePlannerRouteContext({
      supabase,
    });
    const body = await parseBoundedJsonBody(
      request,
      Math.min(MAX_API_BODY_BYTES, 128 * 1024),
      coachConversationSaveRequestSchema
    );
    const title = deriveConversationTitle(body);
    const previewText = deriveConversationPreview(body, title);
    const saveResponse = await routeContext.supabase.rpc(
      "save_planner_coach_conversation_service",
      {
        p_scope_month: body.scopeMonth,
        p_timezone: body.timezone,
        p_title: title,
        p_preview_text: previewText,
        p_messages: body.messages.map((message) => ({
          role: message.role,
          content: message.content,
          proposal:
            message.role === "assistant" ? (message.proposal ?? null) : null,
        })),
      }
    );
    if (saveResponse.error) {
      throw new PlannerRouteError(
        503,
        "conversation_save_failed",
        "Coach conversation could not be saved.",
        { cause: saveResponse.error.message }
      );
    }
    const conversationRow = Array.isArray(saveResponse.data)
      ? saveResponse.data[0]
      : saveResponse.data;
    if (!conversationRow) {
      throw new PlannerRouteError(
        500,
        "conversation_save_invariant_failed",
        "Conversation save did not return a persisted summary."
      );
    }

    const summary = coachConversationSummaryTableRowSchema.parse(conversationRow);
    const conversation = mapCoachConversationSummaryRow(summary);
    return NextResponse.json(
      {
        schemaVersion: "1",
        conversation,
        correlationId,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}
