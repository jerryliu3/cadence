export function isValidIanaTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveUserTimezone(candidateTimezone?: string | null) {
  const normalizedCandidate = candidateTimezone?.trim();
  if (normalizedCandidate && isValidIanaTimezone(normalizedCandidate)) {
    return normalizedCandidate;
  }

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
  if (detectedTimezone && isValidIanaTimezone(detectedTimezone)) {
    return detectedTimezone;
  }

  return "UTC";
}

export function getDateInTimezone(date: Date, timezone: string) {
  if (!isValidIanaTimezone(timezone)) {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}
