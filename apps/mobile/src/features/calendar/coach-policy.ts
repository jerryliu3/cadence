export type CoachPolicyPatch =
  | { kind: "set_rest_weekdays"; restWeekdays: number[] }
  | { kind: "add_blackout_range"; start: string; end: string }
  | { kind: "remove_blackout_range"; start: string; end: string };

export interface MobilePlannerPolicy {
  schemaVersion?: number;
  timezone?: string;
  timezoneConfirmedAt?: string;
  weekStartsOn?: number;
  restWeekdays: number[];
  blackoutRanges: Array<{ start: string; end: string }>;
}

export function applyCoachPolicyPatches({
  policy,
  patches,
}: {
  policy: MobilePlannerPolicy;
  patches: CoachPolicyPatch[];
}): { policy: MobilePlannerPolicy; appliedPatchCount: number } {
  const nextPolicy: MobilePlannerPolicy = {
    ...policy,
    restWeekdays: [...(policy.restWeekdays ?? [])],
    blackoutRanges: [...(policy.blackoutRanges ?? [])],
  };
  let appliedPatchCount = 0;

  for (const patch of patches) {
    if (patch.kind === "set_rest_weekdays") {
      const normalized = Array.from(new Set(patch.restWeekdays)).sort(
        (left, right) => left - right
      );
      nextPolicy.restWeekdays = normalized;
      appliedPatchCount += 1;
      continue;
    }
    if (patch.kind === "add_blackout_range") {
      const exists = nextPolicy.blackoutRanges.some(
        (range) => range.start === patch.start && range.end === patch.end
      );
      if (!exists) {
        nextPolicy.blackoutRanges.push({ start: patch.start, end: patch.end });
        appliedPatchCount += 1;
      }
      continue;
    }
    if (patch.kind === "remove_blackout_range") {
      const before = nextPolicy.blackoutRanges.length;
      nextPolicy.blackoutRanges = nextPolicy.blackoutRanges.filter(
        (range) => range.start !== patch.start || range.end !== patch.end
      );
      if (nextPolicy.blackoutRanges.length !== before) {
        appliedPatchCount += 1;
      }
    }
  }

  return { policy: nextPolicy, appliedPatchCount };
}

export function buildCoachDeterministicSummary({
  scopeMonth,
  timezone,
  asOfDate,
  workUnits,
  goalTitles,
}: {
  scopeMonth: string;
  timezone: string;
  asOfDate: string;
  workUnits: Array<{
    originalGoalId: string;
    label: string | null;
    scheduledDate: string | null;
    creditState: string;
  }>;
  goalTitles: Record<string, string>;
}) {
  const placed = workUnits.filter((unit) => unit.scheduledDate);
  const credited = workUnits.filter((unit) => unit.creditState !== "uncredited");
  const byDate = new Map<string, string[]>();
  for (const unit of placed) {
    const date = unit.scheduledDate as string;
    const labels = byDate.get(date) ?? [];
    labels.push(goalTitles[unit.originalGoalId] ?? unit.label ?? unit.originalGoalId);
    byDate.set(date, labels);
  }
  const dayLines = Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 14)
    .map(([date, labels]) => `${date}: ${labels.slice(0, 3).join(", ")}`);
  return [
    `scopeMonth=${scopeMonth}`,
    `timezone=${timezone}`,
    `asOfDate=${asOfDate}`,
    `totalWorkUnits=${workUnits.length}`,
    `scheduledUnits=${placed.length}`,
    `creditedUnits=${credited.length}`,
    "dayAssignments:",
    ...dayLines,
  ].join("\n");
}
