export interface PlannerCapabilities {
  calendarEnabled: boolean;
  plannerRead: boolean;
  plannerGeneration: boolean;
  plannerPlanWrites: boolean;
  targetedExactCompletion: boolean;
  coachAi: boolean;
  overlap: boolean;
}

function parseBoolean(
  flagName: string,
  value: string | undefined,
  defaultValue: boolean
) {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return defaultValue;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  console.warn(
    `[planner-capabilities] Invalid ${flagName} value "${value}", using default ${defaultValue}.`
  );
  return defaultValue;
}

function evaluateCapability(flagName: string, defaultValue = false) {
  return parseBoolean(flagName, process.env[flagName], defaultValue);
}

export function getPlannerCapabilities(): PlannerCapabilities {
  const calendarEnabled = evaluateCapability("CALENDAR_ENABLED", true);
  const overlap = calendarEnabled
    ? evaluateCapability("PLANNER_OVERLAP_ENABLED", true)
    : false;
  return {
    calendarEnabled,
    plannerRead: calendarEnabled,
    plannerGeneration: calendarEnabled,
    plannerPlanWrites: calendarEnabled,
    targetedExactCompletion: calendarEnabled,
    coachAi: calendarEnabled,
    overlap,
  };
}
