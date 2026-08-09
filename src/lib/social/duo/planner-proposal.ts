import { z } from "zod";

const scopeMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-[0-3][0-9]$/;
const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const moveItemOperationSchema = z.object({
  op: z.literal("move_item"),
  goalId: z.uuid(),
  unitKey: z.string().trim().min(1).max(120),
  toDate: z.string().regex(dateRegex),
  toTime: z.string().regex(timeRegex).optional(),
});

const lockItemOperationSchema = z.object({
  op: z.literal("lock_item"),
  goalId: z.uuid(),
  unitKey: z.string().trim().min(1).max(120),
  locked: z.boolean(),
});

const clearMonthOperationSchema = z.object({
  op: z.literal("clear_month"),
});

export const plannerProposalOperationSchema = z.discriminatedUnion("op", [
  moveItemOperationSchema,
  lockItemOperationSchema,
  clearMonthOperationSchema,
]);

export const plannerProposalOperationsSchema = z.array(plannerProposalOperationSchema).min(1).max(50);

export const createPlannerProposalSchema = z.object({
  targetOwnerId: z.uuid(),
  scopeMonth: z.string().regex(scopeMonthRegex),
  operations: plannerProposalOperationsSchema,
  note: z.string().trim().max(500).optional(),
});

export type PlannerProposalOperation = z.infer<typeof plannerProposalOperationSchema>;
export type PlannerScheduleItemInput = {
  goalId: string;
  unitKey: string;
  scheduledDate: string;
  scheduledTime: string | null;
  locked: boolean;
};

function assertDateWithinMonth(date: string, scopeMonth: string) {
  if (!date.startsWith(`${scopeMonth}-`)) {
    throw new Error("Operation date falls outside proposal scope month.");
  }
}

export function toScopeMonthDate(scopeMonth: string) {
  if (!scopeMonthRegex.test(scopeMonth)) {
    throw new Error("Invalid scope month.");
  }
  return `${scopeMonth}-01`;
}

export function applyPlannerProposalOperations({
  scopeMonth,
  items,
  operations,
}: {
  scopeMonth: string;
  items: PlannerScheduleItemInput[];
  operations: PlannerProposalOperation[];
}) {
  const byKey = new Map<string, PlannerScheduleItemInput>();
  for (const item of items) {
    byKey.set(`${item.goalId}::${item.unitKey}`, { ...item });
  }

  for (const operation of operations) {
    if (operation.op === "clear_month") {
      byKey.clear();
      continue;
    }

    const key = `${operation.goalId}::${operation.unitKey}`;
    const current = byKey.get(key);
    if (!current) {
      throw new Error(`Planner operation references missing item: ${key}`);
    }

    if (operation.op === "move_item") {
      assertDateWithinMonth(operation.toDate, scopeMonth);
      byKey.set(key, {
        ...current,
        scheduledDate: operation.toDate,
        scheduledTime: operation.toTime ?? null,
      });
      continue;
    }

    byKey.set(key, {
      ...current,
      locked: operation.locked,
    });
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.scheduledDate !== right.scheduledDate) {
      return left.scheduledDate.localeCompare(right.scheduledDate);
    }
    if (left.goalId !== right.goalId) {
      return left.goalId.localeCompare(right.goalId);
    }
    return left.unitKey.localeCompare(right.unitKey);
  });
}
