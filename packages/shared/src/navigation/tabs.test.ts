import { describe, expect, it } from "vitest";
import { APP_TABS, buildAppTabs } from "./tabs";

describe("app navigation tabs", () => {
  it("uses checklist-first planner ordering by default", () => {
    expect(APP_TABS).toEqual([
      { key: "insights", href: "/insights", label: "Insights" },
      { key: "checklist", href: "/checklist", label: "Checklist" },
      { key: "calendar", href: "/calendar", label: "Calendar" },
      { key: "social", href: "/social", label: "Challenges" },
      { key: "settings", href: "/settings", label: "Profile" },
    ]);
  });

  it("supports calendar-first planner ordering", () => {
    expect(buildAppTabs("calendar")).toEqual([
      { key: "insights", href: "/insights", label: "Insights" },
      { key: "calendar", href: "/calendar", label: "Calendar" },
      { key: "checklist", href: "/checklist", label: "Checklist" },
      { key: "social", href: "/social", label: "Challenges" },
      { key: "settings", href: "/settings", label: "Profile" },
    ]);
  });
});
