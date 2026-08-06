import { z } from "zod";
import {
  coachPolicyPatchSchema,
  MAX_COACH_MESSAGE_CHARS,
  MAX_COACH_MESSAGES,
} from "@/lib/planner/coach";
import { plannerPolicySchema } from "@/lib/planner/policy";

const scopeMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const hashPattern = /^[0-9a-f]{64}$/;
const snapshotTokenPattern = /^[a-z0-9:_-]{16,128}$/;

export const coachConversationProposalSchema = z
  .object({
    schemaVersion: z.literal("1"),
    applyStatus: z.enum([
      "not_applied",
      "auto_applied",
      "manually_applied",
      "undone",
    ]),
    patchSignature: z.string().regex(hashPattern),
    baselineSnapshotToken: z.string().regex(snapshotTokenPattern),
    baselinePolicy: plannerPolicySchema.nullable(),
    policyPatches: z.array(coachPolicyPatchSchema).min(1).max(50),
    unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export const coachConversationMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_COACH_MESSAGE_CHARS),
    createdAt: z.number().int().nonnegative().optional(),
    proposal: coachConversationProposalSchema.nullable().optional(),
  })
  .superRefine((message, context) => {
    if (message.role === "user" && message.proposal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User coach messages cannot include proposal metadata.",
        path: ["proposal"],
      });
    }
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
export type CoachConversationProposal = z.infer<
  typeof coachConversationProposalSchema
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
