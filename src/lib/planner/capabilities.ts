export interface PlannerCapabilities {
  plannerRead: boolean;
  plannerGeneration: boolean;
  plannerPlanWrites: boolean;
  targetedExactCompletion: boolean;
  coachAi: boolean;
  overlap: boolean;
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Invalid feature flag value: ${value}`);
}

function ownerIsAllowed(
  ownerId: string,
  allowlistValue: string | undefined
) {
  if (!allowlistValue?.trim()) {
    return true;
  }
  return new Set(
    allowlistValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  ).has(ownerId);
}

function evaluateCapability(
  ownerId: string,
  flagName: string,
  defaultValue = false
) {
  return (
    parseBoolean(process.env[flagName], defaultValue) &&
    ownerIsAllowed(ownerId, process.env[`${flagName}_OWNER_ALLOWLIST`])
  );
}

export function getPlannerCapabilities(ownerId: string): PlannerCapabilities {
  const capabilities = {
    plannerRead: evaluateCapability(
      ownerId,
      "CALENDAR_PLANNER_READ_ENABLED"
    ),
    plannerGeneration: evaluateCapability(
      ownerId,
      "CALENDAR_PLANNER_GENERATION_ENABLED"
    ),
    plannerPlanWrites: evaluateCapability(
      ownerId,
      "CALENDAR_PLANNER_PLAN_WRITES_ENABLED"
    ),
    targetedExactCompletion: evaluateCapability(
      ownerId,
      "CALENDAR_TARGETED_EXACT_COMPLETION_ENABLED",
      true
    ),
    coachAi: evaluateCapability(ownerId, "CALENDAR_COACH_AI_ENABLED"),
    overlap: evaluateCapability(ownerId, "CALENDAR_OVERLAP_ENABLED"),
  };

  if (
    (capabilities.plannerGeneration || capabilities.plannerPlanWrites) &&
    !capabilities.plannerRead
  ) {
    throw new Error(
      "Planner generation and writes require CALENDAR_PLANNER_READ_ENABLED."
    );
  }
  if (capabilities.coachAi && !capabilities.plannerGeneration) {
    throw new Error(
      "Calendar coach AI requires CALENDAR_PLANNER_GENERATION_ENABLED."
    );
  }
  if (
    capabilities.overlap &&
    (!capabilities.plannerRead ||
      !capabilities.plannerGeneration ||
      !capabilities.plannerPlanWrites)
  ) {
    throw new Error(
      "Calendar overlap requires planner read, generation, and writes."
    );
  }

  return capabilities;
}
