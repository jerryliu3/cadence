import { describe, expect, it } from "vitest";
import { APP_TABS, buildAppTabs } from "./tabs";

describe("app navigation tabs", () => {
  it("keeps Planner as a single top-level tab", () => {
    expect(APP_TABS).toEqual([
      { key: "insights", href: "/insights", label: "Insights" },
      { key: "calendar", href: "/calendar", label: "Planner" },
      { key: "social", href: "/social", label: "Community" },
      { key: "settings", href: "/settings", label: "Profile" },
    ]);
  });

  it("keeps top-level tabs stable across planner preference values", () => {
    expect(buildAppTabs("calendar")).toEqual([
      { key: "insights", href: "/insights", label: "Insights" },
      { key: "calendar", href: "/calendar", label: "Planner" },
      { key: "social", href: "/social", label: "Community" },
      { key: "settings", href: "/settings", label: "Profile" },
    ]);
  });
});
