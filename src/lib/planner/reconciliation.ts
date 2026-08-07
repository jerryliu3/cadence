import {
  getAdmissibleCompletions,
  isCompletionAdmissible,
} from "@/lib/goals/admissible";
import type { Completion, Goal } from "@/lib/goals/types";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import {
  workUnitCanCreditDate,
  type PlannerWorkUnit,
  type WorkUnitClassification,
} from "@/lib/planner/work-units";

export type PlannerDriftType =
  | "inadmissible"
  | "out_of_plan"
  | "credited_work_removed"
  | "credited_work_reassigned";

export interface PlannerDriftFact {
  completionId: string;
  completedOn: string;
  driftType: PlannerDriftType;
}

export interface PlannerCompletionUnitIdentity {
  goalId: string;
  requirementFingerprint: string;
  unitKey: string;
  completedOn: string;
}

export interface ReconciliationResult {
  units: PlannerWorkUnit[];
  completionToUnit: Record<string, PlannerCompletionUnitIdentity>;
  driftFacts: PlannerDriftFact[];
}

function cloneUnits(units: PlannerWorkUnit[]) {
  return units
    .map((unit) => ({
      ...unit,
      creditWindow: { ...unit.creditWindow },
      placementWindow: unit.placementWindow
        ? { ...unit.placementWindow }
        : null,
      creditedCompletionId: null,
      creditedCompletionDate: null,
      creditState: "uncredited" as PlannerWorkUnit["creditState"],
    }))
    .sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      return compareCanonicalStrings(left.unitKey, right.unitKey);
    });
}

export function reconcilePlannerCompletions({
  goal,
  workUnits,
  completions,
  asOfDate,
  previousCompletionToUnit = {},
}: {
  goal: Goal;
  workUnits: PlannerWorkUnit[];
  completions: Completion[];
  asOfDate: string;
  previousCompletionToUnit?: Record<
    string,
    PlannerCompletionUnitIdentity
  >;
}): ReconciliationResult {
  const units = cloneUnits(workUnits);
  const relevantFacts = completions.filter(
    (completion) => completion.goal_id === goal.id
  );
  const admissible = getAdmissibleCompletions(goal, relevantFacts, {
    asOfDate,
  });
  const admissibleById = new Map(
    admissible.map((completion) => [completion.id, completion])
  );
  const used = new Set<string>();
  const completionToUnit: Record<
    string,
    PlannerCompletionUnitIdentity
  > = {};
  const driftFacts: PlannerDriftFact[] = relevantFacts
    .filter(
      (completion) =>
        !isCompletionAdmissible(goal, completion.completed_on, {
          asOfDate,
        })
    )
    .map((completion) => ({
      completionId: completion.id,
      completedOn: completion.completed_on,
      driftType: "inadmissible",
    }));

  const credit = (unit: PlannerWorkUnit, completion: Completion) => {
    if (used.has(completion.id) || !admissibleById.has(completion.id)) {
      return;
    }
    used.add(completion.id);
    completionToUnit[completion.id] = {
      goalId: unit.originalGoalId,
      requirementFingerprint: unit.requirementFingerprint,
      unitKey: unit.unitKey,
      completedOn: completion.completed_on,
    };
    unit.creditedCompletionId = completion.id;
    unit.creditedCompletionDate = completion.completed_on;
  };

  if (units[0]?.kind === "deadline_total") {
    const unitByKey = new Map(units.map((unit) => [unit.unitKey, unit]));
    for (const completion of admissible) {
      const previousIdentity = previousCompletionToUnit[completion.id];
      if (
        !previousIdentity ||
        previousIdentity.goalId !== goal.id ||
        previousIdentity.completedOn !== completion.completed_on
      ) {
        continue;
      }
      const unit = unitByKey.get(previousIdentity.unitKey);
      if (
        !unit ||
        unit.creditedCompletionId !== null ||
        unit.requirementFingerprint !== previousIdentity.requirementFingerprint ||
        !workUnitCanCreditDate(unit, completion.completed_on)
      ) {
        continue;
      }
      credit(unit, completion);
    }
  }

  if (units[0]?.kind === "milestone_sequence") {
    for (
      let index = 0;
      index < units.length && index < admissible.length;
      index += 1
    ) {
      credit(units[index], admissible[index]);
    }
  } else if (units[0]?.kind === "deadline_total") {
    for (const unit of units) {
      if (!unit.scheduledDate) {
        continue;
      }
      const match = admissible.find(
        (completion) =>
          !used.has(completion.id) &&
          completion.completed_on === unit.scheduledDate
      );
      if (match) {
        credit(unit, match);
      }
    }

    const remainingFacts = admissible.filter(
      (completion) => !used.has(completion.id)
    );
    let factIndex = 0;
    for (const unit of units) {
      if (unit.creditedCompletionId || factIndex >= remainingFacts.length) {
        continue;
      }
      credit(unit, remainingFacts[factIndex]);
      factIndex += 1;
    }
  } else {
    for (const unit of units) {
      const match = admissible.find(
        (completion) =>
          !used.has(completion.id) &&
          completion.completed_on >= unit.creditWindow.start &&
          completion.completed_on <= unit.creditWindow.end
      );
      if (match) {
        credit(unit, match);
      }
    }
  }

  for (const unit of units) {
    if (!unit.creditedCompletionId || !unit.creditedCompletionDate) {
      continue;
    }
    const completedAsScheduled =
      unit.scheduledDate !== null &&
      unit.scheduledDate === unit.creditedCompletionDate;
    unit.creditState = completedAsScheduled
      ? "completed_as_scheduled"
      : "completed_elsewhere";
    // Deadline-total ordinals are tied to scheduled-date-first reconciliation,
    // so an off-schedule credit changes the item state. Cadence identity is the
    // anchored period itself: any date in that credit window legitimately
    // fulfills the unit, while creditState still records schedule drift.
    const classification: WorkUnitClassification =
      unit.kind === "deadline_total" &&
      unit.scheduledDate !== null &&
      !completedAsScheduled
        ? "satisfied_elsewhere"
        : "fulfilled";
    unit.classification = classification;
  }

  for (const completion of admissible) {
    const belongsToOwnedCadenceWindow =
      units[0]?.kind !== "cadence" ||
      units.some((unit) =>
        workUnitCanCreditDate(unit, completion.completed_on)
      );
    if (!used.has(completion.id) && belongsToOwnedCadenceWindow) {
      driftFacts.push({
        completionId: completion.id,
        completedOn: completion.completed_on,
        driftType: "out_of_plan",
      });
    }
  }

  for (const [completionId, identity] of Object.entries(completionToUnit)) {
    const previousIdentity = previousCompletionToUnit[completionId];
    if (
      previousIdentity &&
      (previousIdentity.goalId !== identity.goalId ||
        previousIdentity.requirementFingerprint !==
          identity.requirementFingerprint ||
        previousIdentity.unitKey !== identity.unitKey)
    ) {
      const completion = admissibleById.get(completionId);
      if (completion) {
        driftFacts.push({
          completionId,
          completedOn: completion.completed_on,
          driftType: "credited_work_reassigned",
        });
      }
    }
  }
  for (const [completionId, previousIdentity] of Object.entries(
    previousCompletionToUnit
  )) {
    if (
      previousIdentity.goalId === goal.id &&
      !completionToUnit[completionId] &&
      !driftFacts.some(
        (drift) =>
          drift.completionId === completionId &&
          drift.driftType === "credited_work_removed"
      )
    ) {
      driftFacts.push({
        completionId,
        completedOn: previousIdentity.completedOn,
        driftType: "credited_work_removed",
      });
    }
  }

  return {
    units,
    completionToUnit,
    driftFacts: driftFacts.sort((left, right) => {
      const byDate = compareCanonicalStrings(
        left.completedOn,
        right.completedOn
      );
      if (byDate !== 0) return byDate;
      const byId = compareCanonicalStrings(
        left.completionId,
        right.completionId
      );
      return byId !== 0
        ? byId
        : compareCanonicalStrings(left.driftType, right.driftType);
    }),
  };
}
