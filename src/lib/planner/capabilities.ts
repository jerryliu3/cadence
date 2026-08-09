export interface PlannerCapabilities {
  calendarEnabled: boolean;
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
  return {
    calendarEnabled,
  };
}
