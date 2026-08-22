import { describe, expect, it } from "vitest";
import { APP_TABS, buildAppTabs } from "./tabs";

describe("app navigation tabs", () => {
  it("keeps Planner as a single top-level tab", () => {
    expect(APP_TABS).toEqual([
      { key: "insights", href: "/app/insights", label: "Insights" },
      { key: "calendar", href: "/app/calendar", label: "Planner" },
      { key: "social", href: "/app/social", label: "Community" },
      { key: "settings", href: "/app/settings", label: "Profile" },
    ]);
  });

  it("keeps top-level tabs stable across planner preference values", () => {
    expect(buildAppTabs("calendar")).toEqual([
      { key: "insights", href: "/app/insights", label: "Insights" },
      { key: "calendar", href: "/app/calendar", label: "Planner" },
      { key: "social", href: "/app/social", label: "Community" },
      { key: "settings", href: "/app/settings", label: "Profile" },
    ]);
  });
});
