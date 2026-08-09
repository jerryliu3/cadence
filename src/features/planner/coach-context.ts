interface CoachSummaryWorkUnit {
  originalGoalId: string;
  unitKey: string;
  label: string | null;
  scheduledDate: string | null;
  classification: string;
  creditState: string;
}

interface CoachHorizonGoalSummary {
  goalId: string;
  totalCount: number;
  creditedCount: number;
  remainingCount: number;
  scopeMonthPlannedCount: number;
  months: Array<{
    month: string;
    plannedCount: number;
  }>;
}

interface BuildCoachDeterministicSummaryInput {
  scopeMonth: string;
  timezone: string;
  asOfDate: string;
  workUnits: CoachSummaryWorkUnit[];
  horizonSummary?: CoachHorizonGoalSummary[];
  focusGoalIds?: string[];
  goalTitles?: Record<string, string>;
  events?: string[];
}

const MAX_DAY_LINES = 14;
const MAX_LABELS_PER_DAY = 3;
const MAX_EVENT_LINES = 5;
const MAX_HORIZON_GOALS = 8;
const MAX_HORIZON_MONTH_LINES = 24;
const MAX_SUMMARY_CHARS = 3500;

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

export function buildCoachDeterministicSummary({
  scopeMonth,
  timezone,
  asOfDate,
  workUnits,
  horizonSummary = [],
  focusGoalIds = [],
  goalTitles = {},
  events = [],
}: BuildCoachDeterministicSummaryInput) {
  const placed = workUnits.filter((unit) => unit.scheduledDate !== null);
  const credited = workUnits.filter((unit) => unit.creditState !== "uncredited");
  const byDate = new Map<string, CoachSummaryWorkUnit[]>();
  for (const unit of placed) {
    const date = unit.scheduledDate as string;
    const existing = byDate.get(date) ?? [];
    existing.push(unit);
    byDate.set(date, existing);
  }
  const dayLines = Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_DAY_LINES)
    .map(([date, units]) => {
      const labels = units
        .slice(0, MAX_LABELS_PER_DAY)
        .map((unit) => {
          const label = truncate(unit.label ?? unit.originalGoalId, 28);
          return `[${unit.originalGoalId}/${unit.unitKey}] ${label}`;
        });
      const suffix =
        units.length > MAX_LABELS_PER_DAY
          ? ` (+${units.length - MAX_LABELS_PER_DAY} more)`
          : "";
      return `${date}: ${labels.join(", ")}${suffix}`;
    });
  const eventLines = events
    .slice(-MAX_EVENT_LINES)
    .map((event, index) => `event${index + 1}: ${truncate(event, 140)}`);
  const horizonByGoal = new Map(
    horizonSummary.map((summary) => [summary.goalId, summary])
  );
  const orderedGoalIds = focusGoalIds.length
    ? focusGoalIds
    : horizonSummary.map((summary) => summary.goalId);
  const horizonLines = orderedGoalIds
    .map((goalId) => horizonByGoal.get(goalId))
    .filter((summary): summary is CoachHorizonGoalSummary => Boolean(summary))
    .slice(0, MAX_HORIZON_GOALS)
    .flatMap((summary) => {
      const goalTitle = truncate(goalTitles[summary.goalId] ?? summary.goalId, 40);
      const monthTokens = summary.months
        .filter((month) => month.plannedCount > 0)
        .map((month) => `${month.month}:${month.plannedCount}`);
      const visibleMonthTokens = monthTokens.slice(0, MAX_HORIZON_MONTH_LINES);
      const monthSuffix =
        monthTokens.length > visibleMonthTokens.length
          ? ` (+${monthTokens.length - visibleMonthTokens.length} more)`
          : "";
      return [
        `goal=${goalTitle}|scope=${summary.scopeMonthPlannedCount}|total=${summary.totalCount}|credited=${summary.creditedCount}|remaining=${summary.remainingCount}`,
        `months=${visibleMonthTokens.join(",")}${monthSuffix}`,
      ];
    });

  const summary = [
    `scopeMonth=${scopeMonth}`,
    `timezone=${timezone}`,
    `asOfDate=${asOfDate}`,
    `totalWorkUnits=${workUnits.length}`,
    `scheduledUnits=${placed.length}`,
    `creditedUnits=${credited.length}`,
    ...(horizonLines.length > 0 ? ["horizonSummary:", ...horizonLines] : []),
    `dayAssignments:`,
    ...dayLines,
    ...(eventLines.length > 0 ? ["recentCoachEvents:", ...eventLines] : []),
  ].join("\n");

  return truncate(summary, MAX_SUMMARY_CHARS);
}
