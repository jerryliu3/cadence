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

const coachConversationPolicyProposalSchema = z
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
    appliedMoveEntryKeys: z
      .array(z.string().trim().min(1).max(400))
      .max(4000)
      .optional(),
    unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

const coachConversationGoalDraftProposalSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("goal_draft"),
    parserPrompt: z.string().trim().min(1).max(2000),
    creationStatus: z.enum(["not_created", "created"]),
  })
  .strict();

export const coachConversationProposalSchema = z.union([
  coachConversationPolicyProposalSchema,
  coachConversationGoalDraftProposalSchema,
]);

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

export const coachConversationSummaryTableRowSchema = z
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

export const coachConversationMessageTableRowSchema = z
  .object({
    ordinal: z.number().int(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    created_at: z.string(),
    proposal_meta: z.unknown().nullable().optional(),
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

export function mapCoachConversationSummaryRow(
  row: z.infer<typeof coachConversationSummaryTableRowSchema>
) {
  return coachConversationSummarySchema.parse({
    id: row.id,
    scopeMonth: row.scope_month,
    timezone: row.timezone,
    title: row.title,
    previewText: row.preview_text,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function mapCoachConversationMessageRow(
  row: z.infer<typeof coachConversationMessageTableRowSchema>,
  index: number
) {
  const parsedProposal =
    row.role === "assistant" ? parseProposalMeta(row.proposal_meta) : null;
  return coachConversationMessageSchema.parse({
    role: row.role,
    content: row.content,
    createdAt: Number.isFinite(Date.parse(row.created_at))
      ? Date.parse(row.created_at)
      : Date.now() + index,
    proposal: parsedProposal ?? undefined,
  });
}

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
