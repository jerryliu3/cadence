export function normalizeWeekStartsOn(
  weekStartsOn: number | null | undefined
): number {
  if (
    typeof weekStartsOn === "number" &&
    Number.isInteger(weekStartsOn) &&
    weekStartsOn >= 0 &&
    weekStartsOn <= 6
  ) {
    return weekStartsOn;
  }
  return 1;
}
