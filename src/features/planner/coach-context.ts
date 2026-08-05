interface CoachSummaryWorkUnit {
  originalGoalId: string;
  label: string | null;
  scheduledDate: string | null;
  classification: string;
  creditState: string;
}

interface BuildCoachDeterministicSummaryInput {
  scopeMonth: string;
  timezone: string;
  asOfDate: string;
  workUnits: CoachSummaryWorkUnit[];
  events?: string[];
}

const MAX_DAY_LINES = 14;
const MAX_LABELS_PER_DAY = 3;
const MAX_EVENT_LINES = 5;
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
        .map((unit) => truncate(unit.label ?? unit.originalGoalId, 40));
      const suffix =
        units.length > MAX_LABELS_PER_DAY
          ? ` (+${units.length - MAX_LABELS_PER_DAY} more)`
          : "";
      return `${date}: ${labels.join(", ")}${suffix}`;
    });
  const eventLines = events
    .slice(-MAX_EVENT_LINES)
    .map((event, index) => `event${index + 1}: ${truncate(event, 140)}`);

  const summary = [
    `scopeMonth=${scopeMonth}`,
    `timezone=${timezone}`,
    `asOfDate=${asOfDate}`,
    `totalWorkUnits=${workUnits.length}`,
    `scheduledUnits=${placed.length}`,
    `creditedUnits=${credited.length}`,
    `dayAssignments:`,
    ...dayLines,
    ...(eventLines.length > 0 ? ["recentCoachEvents:", ...eventLines] : []),
  ].join("\n");

  return truncate(summary, MAX_SUMMARY_CHARS);
}
