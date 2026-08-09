export interface XpCapabilities {
  xpEnabled: boolean;
}

function parseBooleanFlag(
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
    `[xp-capabilities] Invalid ${flagName} value "${value}", using default ${defaultValue}.`
  );
  return defaultValue;
}

export function getXpCapabilities(): XpCapabilities {
  return {
    xpEnabled: parseBooleanFlag("XP_ENABLED", process.env.XP_ENABLED, false),
  };
}
