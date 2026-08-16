const AUTOMATED_MOVE_BLOCKED_CLASSIFICATIONS = new Set([
  "historical_miss",
  "historical_shortfall",
]);

export function shouldBlockAutomatedReplanMoveForEntry({
  baselineClassification,
  baselineScheduledDate,
  asOfDate,
}: {
  baselineClassification: string | null | undefined;
  baselineScheduledDate: string | null | undefined;
  asOfDate: string;
}) {
  if (
    baselineClassification &&
    AUTOMATED_MOVE_BLOCKED_CLASSIFICATIONS.has(baselineClassification)
  ) {
    return true;
  }
  return (
    baselineScheduledDate !== null &&
    baselineScheduledDate !== undefined &&
    baselineScheduledDate < asOfDate
  );
}

export function isHistoricalPlannerEntryClassification(classification: string) {
  return AUTOMATED_MOVE_BLOCKED_CLASSIFICATIONS.has(classification);
}

