import type { JourneyEffectEvent, JourneyEffectKind } from "./contract";

export function createJourneyEffectEvent({
  kind,
  sourceEventId,
  occurredAt,
}: {
  kind: JourneyEffectKind;
  sourceEventId: string;
  occurredAt?: string;
}): JourneyEffectEvent {
  const at = occurredAt ?? new Date().toISOString();
  return {
    id: `${kind}:${sourceEventId}:${at}`,
    kind,
    sourceEventId,
    occurredAt: at,
  };
}

export function consumeJourneyEffectEvent(
  consumedIds: Set<string>,
  event: JourneyEffectEvent
) {
  if (consumedIds.has(event.id)) {
    return false;
  }
  consumedIds.add(event.id);
  return true;
}
