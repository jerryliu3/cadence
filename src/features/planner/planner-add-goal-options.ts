import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

export interface PlannerAddGoalOption {
  goalId: string;
  title: string;
  kind: "milestone_sequence" | "deadline_total";
  targetCount: number;
  creditedCount: number;
}

interface PlannerAddGoalCandidate extends PlannerAddGoalOption {
  startDate: string | null;
  endDate: string | null;
}

function isTargetedKind(
  kind: PlannerWorkUnit["kind"] | undefined
): kind is "milestone_sequence" | "deadline_total" {
  return kind === "milestone_sequence" || kind === "deadline_total";
}

export function buildPlannerAddGoalOptions({
  day,
  entriesForDay,
  workUnits,
  goalTitles,
}: {
  day: string | null;
  entriesForDay: PlannerDayDetailEntry[];
  workUnits: PlannerWorkUnit[];
  goalTitles: Record<string, string>;
}): PlannerAddGoalOption[] {
  if (!day) {
    return [];
  }
  const scheduledGoalIds = new Set(
    entriesForDay
      .filter((entry) => !entry.draftGhost)
      .map((entry) => entry.originalGoalId)
  );

  const byGoalId = new Map<string, PlannerAddGoalCandidate>();
  for (const unit of workUnits) {
    if (!isTargetedKind(unit.kind)) {
      continue;
    }
    const existing = byGoalId.get(unit.originalGoalId);
    if (existing) {
      existing.targetCount += 1;
      if (unit.creditState !== "uncredited") {
        existing.creditedCount += 1;
      }
      if (unit.creditWindow?.start) {
        existing.startDate =
          existing.startDate === null || unit.creditWindow.start < existing.startDate
            ? unit.creditWindow.start
            : existing.startDate;
      }
      if (unit.creditWindow?.end) {
        existing.endDate =
          existing.endDate === null || unit.creditWindow.end > existing.endDate
            ? unit.creditWindow.end
            : existing.endDate;
      }
      continue;
    }

    byGoalId.set(unit.originalGoalId, {
      goalId: unit.originalGoalId,
      title: goalTitles[unit.originalGoalId] ?? "Untitled goal",
      kind: unit.kind,
      targetCount: 1,
      creditedCount: unit.creditState === "uncredited" ? 0 : 1,
      startDate: unit.creditWindow?.start ?? null,
      endDate: unit.creditWindow?.end ?? null,
    });
  }

  return Array.from(byGoalId.values())
    .filter((candidate) => {
      if (scheduledGoalIds.has(candidate.goalId)) {
        return false;
      }
      if (candidate.creditedCount >= candidate.targetCount) {
        return false;
      }
      if (candidate.startDate && day < candidate.startDate) {
        return false;
      }
      if (candidate.endDate && day > candidate.endDate) {
        return false;
      }
      return true;
    })
    .sort((left, right) => left.title.localeCompare(right.title))
    .map(({ startDate: _startDate, endDate: _endDate, ...candidate }) => candidate);
}
