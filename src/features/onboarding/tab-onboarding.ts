export type TabOnboardingKey =
  | "insights.main"
  | "planner.calendar"
  | "planner.checklist"
  | "planner.tasks"
  | "social.feed"
  | "social.challenges"
  | "social.leaderboards"
  | "social.team"
  | "settings.profile";

export const TAB_ONBOARDING_QUERY_PARAM = "onboarding";
export const TAB_ONBOARDING_COMPLETED_PREFIX =
  "cadence.tab_onboarding_completed.v1:";

function tabOnboardingStorageKey(onboardingKey: TabOnboardingKey) {
  return `${TAB_ONBOARDING_COMPLETED_PREFIX}${onboardingKey}`;
}

export function isTabOnboardingCompleted(onboardingKey: TabOnboardingKey) {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(tabOnboardingStorageKey(onboardingKey)) === "done";
}

export function markTabOnboardingCompleted(onboardingKey: TabOnboardingKey) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(tabOnboardingStorageKey(onboardingKey), "done");
}

export const ALL_TAB_ONBOARDING_KEYS: TabOnboardingKey[] = [
  "insights.main",
  "planner.calendar",
  "planner.checklist",
  "planner.tasks",
  "social.feed",
  "social.challenges",
  "social.leaderboards",
  "social.team",
  "settings.profile",
];

export function clearAllTabOnboardingProgress() {
  if (typeof window === "undefined") {
    return;
  }
  for (const onboardingKey of ALL_TAB_ONBOARDING_KEYS) {
    window.localStorage.removeItem(tabOnboardingStorageKey(onboardingKey));
  }
}

export interface TabOnboardingReplayLink {
  key: TabOnboardingKey;
  label: string;
  href: string;
}

export const TAB_ONBOARDING_REPLAY_LINKS: TabOnboardingReplayLink[] = [
  {
    key: "planner.calendar",
    label: "Replay Calendar guide",
    href: `/calendar?surface=calendar&${TAB_ONBOARDING_QUERY_PARAM}=planner.calendar`,
  },
  {
    key: "planner.checklist",
    label: "Replay Checklist guide",
    href: `/calendar?surface=checklist&${TAB_ONBOARDING_QUERY_PARAM}=planner.checklist`,
  },
  {
    key: "planner.tasks",
    label: "Replay Tasks guide",
    href: `/calendar?surface=tasks&${TAB_ONBOARDING_QUERY_PARAM}=planner.tasks`,
  },
  {
    key: "insights.main",
    label: "Replay Insights guide",
    href: `/insights?${TAB_ONBOARDING_QUERY_PARAM}=insights.main`,
  },
  {
    key: "social.feed",
    label: "Replay Feed guide",
    href: `/social?tab=feed&${TAB_ONBOARDING_QUERY_PARAM}=social.feed`,
  },
  {
    key: "social.challenges",
    label: "Replay Challenges guide",
    href: `/social?tab=challenges&${TAB_ONBOARDING_QUERY_PARAM}=social.challenges`,
  },
  {
    key: "social.leaderboards",
    label: "Replay Leaderboards guide",
    href: `/social?tab=leaderboards&${TAB_ONBOARDING_QUERY_PARAM}=social.leaderboards`,
  },
  {
    key: "social.team",
    label: "Replay Team guide",
    href: `/social?tab=team&${TAB_ONBOARDING_QUERY_PARAM}=social.team`,
  },
  {
    key: "settings.profile",
    label: "Replay Profile guide",
    href: `/settings?${TAB_ONBOARDING_QUERY_PARAM}=settings.profile`,
  },
];
