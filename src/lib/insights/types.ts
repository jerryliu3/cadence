export interface InsightsCountTrend {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
}

export interface InsightsRateMetric {
  numerator: number;
  denominator: number;
  percent: number;
}

export interface InsightsRateTrend extends InsightsRateMetric {
  previousNumerator: number;
  previousDenominator: number;
  previousPercent: number;
  deltaPercentPoints: number;
}

export interface InsightsDailyPoint {
  date: string;
  completions: number;
  numerator: number;
  denominator: number;
  percent: number;
}

export interface InsightsWeekdayPoint {
  weekdayIndex: number;
  weekdayLabel: string;
  numerator: number;
  denominator: number;
  percent: number;
}

export interface InsightsCategoryPoint {
  categoryKey: string;
  categoryLabel: string;
  numerator: number;
  denominator: number;
  percent: number;
}

export interface InsightsStatsGroup {
  totalActivities: number;
  totalGoalsCompleted: number;
  todayActivities: number;
  activeStreakDays: number;
  currentWeekActivities: InsightsCountTrend;
  currentMonthActivities: InsightsCountTrend;
  currentWeekCompletion: InsightsRateTrend;
  currentMonthCompletion: InsightsRateTrend;
  totalActiveDaysPercent: InsightsRateMetric;
  totalDays: number;
  rolling30DaysActivities: InsightsCountTrend;
  rolling30DaysCompletion: InsightsRateTrend;
  completionRateByDay: InsightsDailyPoint[];
  completionsPerDay: Array<{ date: string; value: number }>;
  completionByWeekday: InsightsWeekdayPoint[];
  completionRateByCategory: InsightsCategoryPoint[];
}

export interface InsightsStatsResponse {
  schemaVersion: "1";
  asOfDate: string;
  weekStartsOn: number;
  accountCreatedDate: string;
  overall: InsightsStatsGroup;
  team: InsightsStatsGroup | null;
  correlationId: string;
}
