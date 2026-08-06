import { z } from "zod";
import { MAX_COACH_MESSAGE_CHARS, MAX_COACH_MESSAGES } from "@/lib/planner/coach";

const scopeMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const coachConversationMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_COACH_MESSAGE_CHARS),
    createdAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export const coachConversationSaveRequestSchema = z
  .object({
    scopeMonth: z.string().regex(scopeMonthPattern),
    timezone: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(120).optional(),
    messages: z.array(coachConversationMessageSchema).min(1).max(MAX_COACH_MESSAGES),
  })
  .strict();

export const coachConversationListQuerySchema = z
  .object({
    scopeMonth: z.string().regex(scopeMonthPattern).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const coachConversationSummarySchema = z
  .object({
    id: z.uuid(),
    scopeMonth: z.string().regex(scopeMonthPattern),
    timezone: z.string().min(1).max(100),
    title: z.string().min(1).max(120),
    previewText: z.string().max(180),
    messageCount: z.number().int().min(1).max(MAX_COACH_MESSAGES),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type CoachConversationMessageInput = z.infer<
  typeof coachConversationMessageSchema
>;
export type CoachConversationSaveRequest = z.infer<
  typeof coachConversationSaveRequestSchema
>;
export type CoachConversationListQuery = z.infer<
  typeof coachConversationListQuerySchema
>;
export type CoachConversationSummary = z.infer<
  typeof coachConversationSummarySchema
>;

export const coachConversationRestoreParamsSchema = z
  .object({
    conversationId: z.uuid(),
  })
  .strict();
