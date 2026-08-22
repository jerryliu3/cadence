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

const ALL_TAB_ONBOARDING_KEYS: TabOnboardingKey[] = [
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
    key: "planner.checklist",
    label: "Replay Planner guide",
    href: "/calendar?surface=checklist&onboarding=planner.checklist",
  },
  {
    key: "insights.main",
    label: "Replay Insights guide",
    href: "/insights?onboarding=insights.main",
  },
  {
    key: "social.team",
    label: "Replay Team guide",
    href: "/social?tab=team&onboarding=social.team",
  },
  {
    key: "settings.profile",
    label: "Replay Profile guide",
    href: "/settings?onboarding=settings.profile",
  },
];
