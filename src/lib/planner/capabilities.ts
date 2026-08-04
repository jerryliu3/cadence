export interface PlannerCapabilities {
  calendarEnabled: boolean;
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

function evaluateCapability(flagName: string, defaultValue = false) {
  return parseBoolean(process.env[flagName], defaultValue);
}

export function getPlannerCapabilities(): PlannerCapabilities {
  const calendarEnabled = evaluateCapability("CALENDAR_ENABLED", true);
  return {
    calendarEnabled,
    plannerRead: calendarEnabled,
    plannerGeneration: calendarEnabled,
    plannerPlanWrites: calendarEnabled,
    targetedExactCompletion: calendarEnabled,
    coachAi: calendarEnabled,
    overlap: calendarEnabled,
  };
}
