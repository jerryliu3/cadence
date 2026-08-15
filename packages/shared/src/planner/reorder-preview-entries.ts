export function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return items;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderPreviewEntryKeys({
  incompleteKeys,
  completedKeys,
  activeEntryKey,
  overEntryKey,
  existingOrder,
}: {
  incompleteKeys: string[];
  completedKeys: string[];
  activeEntryKey: string;
  overEntryKey: string;
  existingOrder?: string[];
}): string[] | null {
  const movingCompleted = completedKeys.includes(activeEntryKey);
  const targetGroupKeys = movingCompleted ? completedKeys : incompleteKeys;
  if (
    !targetGroupKeys.includes(activeEntryKey) ||
    !targetGroupKeys.includes(overEntryKey)
  ) {
    return null;
  }
  const fallbackOrder = [...incompleteKeys, ...completedKeys];
  const existing = existingOrder ?? fallbackOrder;
  const normalized = [
    ...existing.filter((entryKey) => fallbackOrder.includes(entryKey)),
    ...fallbackOrder.filter((entryKey) => !existing.includes(entryKey)),
  ];
  const groupOrder = normalized.filter((entryKey) =>
    targetGroupKeys.includes(entryKey)
  );
  const fromIndex = groupOrder.indexOf(activeEntryKey);
  const toIndex = groupOrder.indexOf(overEntryKey);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return null;
  }
  const nextGroupOrder = moveItemInArray(groupOrder, fromIndex, toIndex);
  const stableIncomplete = movingCompleted
    ? normalized.filter((entryKey) => incompleteKeys.includes(entryKey))
    : nextGroupOrder;
  const stableCompleted = movingCompleted
    ? nextGroupOrder
    : normalized.filter((entryKey) => completedKeys.includes(entryKey));
  return [...stableIncomplete, ...stableCompleted];
}

export function unitEntryKey(unit: { originalGoalId: string; unitKey: string }) {
  return `${unit.originalGoalId}:${unit.unitKey}`;
}

export interface PlannerMoveItemDraftCommand {
  id: string;
  sequence: number;
  goalId: string;
  unitKey: string;
  kind: "move_item";
  scheduledDate: string | null;
  sourceDate: string;
}

export function createMoveItemDraftCommand({
  goalId,
  unitKey,
  scheduledDate,
  sourceDate,
  sequence = 0,
}: {
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
  sourceDate: string;
  sequence?: number;
}): PlannerMoveItemDraftCommand {
  return {
    id: globalThis.crypto.randomUUID(),
    sequence,
    goalId,
    unitKey,
    kind: "move_item" as const,
    scheduledDate,
    sourceDate,
  };
}
