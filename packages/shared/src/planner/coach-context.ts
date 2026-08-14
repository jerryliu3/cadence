const MAX_COACH_FOCUS_GOALS = 40;
const MAX_DAY_LINES = 20;
const MAX_LABELS_PER_DAY = 3;
const MAX_SUMMARY_CHARS = 3500;

interface CoachSummaryWorkUnit {
  originalGoalId: string;
  label: string | null;
  scheduledDate: string | null;
  classification: string;
  creditState: string;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

export function buildCoachFocusGoalIds({
  workUnits,
  goalTitles,
}: {
  workUnits:
    | Array<{ originalGoalId: string; scheduledDate: string | null }>
    | null
    | undefined;
  goalTitles: Record<string, string> | undefined;
}) {
  const scheduledCountsByGoalId = new Map<string, number>();
  for (const unit of workUnits ?? []) {
    if (!unit.scheduledDate) {
      continue;
    }
    scheduledCountsByGoalId.set(
      unit.originalGoalId,
      (scheduledCountsByGoalId.get(unit.originalGoalId) ?? 0) + 1
    );
  }
  const activeGoalIds = Array.from(scheduledCountsByGoalId.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return (goalTitles?.[left[0]] ?? left[0]).localeCompare(
        goalTitles?.[right[0]] ?? right[0]
      );
    })
    .map(([goalId]) => goalId);
  const fallbackGoalIds = Object.keys(goalTitles ?? {})
    .filter((goalId) => !scheduledCountsByGoalId.has(goalId))
    .sort((left, right) =>
      (goalTitles?.[left] ?? left).localeCompare(
        goalTitles?.[right] ?? right
      )
    );
  return [...activeGoalIds, ...fallbackGoalIds].slice(
    0,
    MAX_COACH_FOCUS_GOALS
  );
}

export function buildCoachDeterministicSummary({
  startDate,
  endDate,
  timezone,
  asOfDate,
  workUnits,
  focusGoalIds = [],
  goalTitles = {},
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  asOfDate: string;
  workUnits: CoachSummaryWorkUnit[];
  focusGoalIds?: string[];
  goalTitles?: Record<string, string>;
}) {
  const placed = workUnits.filter((unit) => unit.scheduledDate !== null);
  const credited = workUnits.filter(
    (unit) => unit.creditState !== "uncredited"
  );
  const byDate = new Map<string, CoachSummaryWorkUnit[]>();
  for (const unit of placed) {
    const date = unit.scheduledDate as string;
    const existing = byDate.get(date) ?? [];
    existing.push(unit);
    byDate.set(date, existing);
  }
  const focusGoalSet = new Set(focusGoalIds);
  const dayLines = Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_DAY_LINES)
    .map(([date, units]) => {
      const ordered = [...units].sort((left, right) => {
        const leftFocused = focusGoalSet.has(left.originalGoalId) ? 0 : 1;
        const rightFocused = focusGoalSet.has(right.originalGoalId) ? 0 : 1;
        return leftFocused - rightFocused;
      });
      const labels = ordered
        .slice(0, MAX_LABELS_PER_DAY)
        .map((unit) =>
          truncate(
            unit.label ??
              goalTitles[unit.originalGoalId] ??
              unit.originalGoalId,
            40
          )
        );
      const suffix =
        units.length > MAX_LABELS_PER_DAY
          ? ` (+${units.length - MAX_LABELS_PER_DAY} more)`
          : "";
      return `${date}: ${labels.join(", ")}${suffix}`;
    });
  return truncate(
    [
      `window=${startDate}..${endDate}`,
      `timezone=${timezone}`,
      `asOfDate=${asOfDate}`,
      `totalWorkUnits=${workUnits.length}`,
      `scheduledUnits=${placed.length}`,
      `creditedUnits=${credited.length}`,
      "dayAssignments:",
      ...dayLines,
    ].join("\n"),
    MAX_SUMMARY_CHARS
  );
}
