import { resolveUserTimezone } from "@/lib/dates/timezone";

export function buildTimezoneOptions(primaryTimezone: string) {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const supportedTimezones =
    typeof intlWithSupportedValues.supportedValuesOf === "function"
      ? intlWithSupportedValues.supportedValuesOf("timeZone")
      : [];
  const detectedTimezone = resolveUserTimezone();

  return Array.from(
    new Set(
      [primaryTimezone, detectedTimezone, "UTC", ...supportedTimezones].filter(
        (value): value is string => Boolean(value)
      )
    )
  ).sort((left, right) => left.localeCompare(right));
}
