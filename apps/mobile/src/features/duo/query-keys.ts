export const duoQueryKeys = {
  team: (viewerUserId: string | null) =>
    ["mobile-duo-team", viewerUserId ?? "anonymous"] as const,
  progressPrefix: (viewerUserId: string | null) =>
    ["mobile-progress", viewerUserId ?? "anonymous"] as const,
  insightsPrefix: (viewerUserId: string | null) =>
    ["mobile-insights", viewerUserId ?? "anonymous"] as const,
  goalsPrefix: (viewerUserId: string | null) =>
    ["mobile-goals", viewerUserId ?? "anonymous"] as const,
  teamMembershipPrefix: (viewerUserId: string | null) =>
    ["mobile-team-memberships", viewerUserId ?? "anonymous"] as const,
  plannerPrefix: (viewerUserId: string | null) =>
    ["mobile-planner-context", viewerUserId ?? "anonymous"] as const,
  calendarOverlayPrefix: (viewerUserId: string | null) =>
    ["mobile-calendar-overlay", viewerUserId ?? "anonymous"] as const,
};

export function buildMobileProgressQueryKey({
  viewerUserId,
  subjectUserId,
  asOfDate,
  timezone,
}: {
  viewerUserId: string | null;
  subjectUserId?: string | null;
  asOfDate: string;
  timezone: string;
}) {
  return [
    ...duoQueryKeys.progressPrefix(viewerUserId),
    subjectUserId ?? viewerUserId ?? "viewer",
    asOfDate,
    timezone,
  ] as const;
}

export function buildMobileInsightsQueryKey({
  viewerUserId,
  subjectUserId,
  factsFrom,
  factsTo,
}: {
  viewerUserId: string | null;
  subjectUserId?: string | null;
  factsFrom: string;
  factsTo: string;
}) {
  return [
    ...duoQueryKeys.insightsPrefix(viewerUserId),
    subjectUserId ?? viewerUserId ?? "viewer",
    factsFrom,
    factsTo,
  ] as const;
}

export function buildMobileGoalsQueryKey({
  viewerUserId,
  subjectUserId,
}: {
  viewerUserId: string | null;
  subjectUserId?: string | null;
}) {
  return [
    ...duoQueryKeys.goalsPrefix(viewerUserId),
    subjectUserId ?? viewerUserId ?? "viewer",
  ] as const;
}

export function buildMobileTeamMembershipQueryKey({
  viewerUserId,
  subjectUserId,
}: {
  viewerUserId: string | null;
  subjectUserId?: string | null;
}) {
  return [
    ...duoQueryKeys.teamMembershipPrefix(viewerUserId),
    subjectUserId ?? viewerUserId ?? "viewer",
  ] as const;
}

export function buildMobilePlannerContextQueryKey({
  viewerUserId,
  subjectUserId,
  month,
  visibleStart,
  visibleEnd,
}: {
  viewerUserId: string | null;
  subjectUserId?: string | null;
  month: string | null;
  visibleStart: string | null;
  visibleEnd: string | null;
}) {
  return [
    ...duoQueryKeys.plannerPrefix(viewerUserId),
    subjectUserId ?? viewerUserId ?? "viewer",
    month,
    visibleStart,
    visibleEnd,
  ] as const;
}

export function buildMobileCalendarOverlayQueryKey({
  viewerUserId,
  partnerUserId,
  month,
}: {
  viewerUserId: string | null;
  partnerUserId: string | null;
  month: string;
}) {
  return [
    ...duoQueryKeys.calendarOverlayPrefix(viewerUserId),
    partnerUserId ?? "none",
    month,
  ] as const;
}
