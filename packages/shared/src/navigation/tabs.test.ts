import { describe, expect, it } from "vitest";
import { APP_TABS } from "./tabs";

describe("app navigation tabs", () => {
  it("nests Checklist under the renamed Planner tab", () => {
    expect(APP_TABS).toEqual([
      { key: "insights", href: "/insights", label: "Insights" },
      { key: "calendar", href: "/calendar", label: "Planner" },
      { key: "social", href: "/social", label: "Challenges" },
      { key: "settings", href: "/settings", label: "Profile" },
    ]);
  });
});
