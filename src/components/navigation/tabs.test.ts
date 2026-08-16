import { describe, expect, it } from "vitest";
import {
  buildAppTabs,
  resolveDefaultMainPageHref,
} from "@/components/navigation/tabs";

describe("navigation tab preferences", () => {
  it("orders planner tabs based on the preferred primary planner tab", () => {
    const calendarFirst = buildAppTabs("calendar");
    const checklistFirst = buildAppTabs("checklist");

    expect(calendarFirst.map((tab) => tab.key)).toEqual([
      "insights",
      "calendar",
      "checklist",
      "social",
      "settings",
    ]);
    expect(checklistFirst.map((tab) => tab.key)).toEqual([
      "insights",
      "checklist",
      "calendar",
      "social",
      "settings",
    ]);
  });

  it("resolves default landing href from profile preference", () => {
    expect(resolveDefaultMainPageHref("calendar")).toBe("/calendar");
    expect(resolveDefaultMainPageHref("checklist")).toBe("/checklist");
    expect(resolveDefaultMainPageHref("insights")).toBe("/insights");
  });
});
