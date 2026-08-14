import {
  addDaysToDateString,
  differenceInDateStrings,
} from "@/lib/goals/periods";
import { canonicalHash } from "@/lib/planner/canonical";
import type { DateWindow } from "@/lib/planner/dates";

function stableIndex(value: unknown, length: number) {
  return Number.parseInt(canonicalHash(value).slice(0, 8), 16) % length;
}

function canonicalCandidateDates(candidateDates: string[]) {
  return Array.from(new Set(candidateDates)).sort();
}

function nearestCandidate(target: string, candidateDates: string[]) {
  let nearest: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of canonicalCandidateDates(candidateDates)) {
    const distance = Math.abs(differenceInDateStrings(candidate, target));
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function computeLifetimeIdealDate({
  goalId,
  ordinal,
  targetCount,
  remainingLifetime,
  candidateDates,
}: {
  goalId: string;
  ordinal: number;
  targetCount: number;
  remainingLifetime: DateWindow;
  candidateDates: string[];
}): string | null {
  if (
    !Number.isSafeInteger(targetCount) ||
    targetCount <= 0 ||
    !Number.isSafeInteger(ordinal) ||
    ordinal <= 0 ||
    ordinal > targetCount
  ) {
    throw new RangeError("Ordinal must fall within a positive target count.");
  }
  if (candidateDates.length === 0) {
    return null;
  }

  const lifetimeDays =
    differenceInDateStrings(
      remainingLifetime.end,
      remainingLifetime.start
    ) + 1;
  if (lifetimeDays <= 0) {
    return null;
  }

  const segmentStart = Math.floor(
    ((ordinal - 1) * lifetimeDays) / targetCount
  );
  const segmentEnd = Math.floor((ordinal * lifetimeDays) / targetCount);
  const segmentLength = segmentEnd - segmentStart;
  const targetIndex =
    segmentLength > 0
      ? segmentStart + stableIndex(goalId, segmentLength)
      : Math.min(
          Math.floor(((ordinal - 0.5) * lifetimeDays) / targetCount),
          lifetimeDays - 1
        );
  const target = addDaysToDateString(remainingLifetime.start, targetIndex);

  return nearestCandidate(target, candidateDates);
}

export function computeCadenceIdealDate({
  goalId,
  periodKey,
  candidateDates,
}: {
  goalId: string;
  periodKey: string;
  candidateDates: string[];
}): string | null {
  const candidates = canonicalCandidateDates(candidateDates);
  if (candidates.length === 0) {
    return null;
  }
  return candidates[
    stableIndex({ goalId, periodKey }, candidates.length)
  ]!;
}
