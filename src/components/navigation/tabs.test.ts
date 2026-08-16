import { describe, expect, it } from "vitest";
import {
  buildAppTabs,
  resolveDefaultMainPageHref,
} from "@/components/navigation/tabs";

describe("navigation tab preferences", () => {
  it("keeps planner as a single top-level tab", () => {
    const calendarFirst = buildAppTabs("calendar");
    const checklistFirst = buildAppTabs("checklist");

    expect(calendarFirst.map((tab) => tab.key)).toEqual([
      "insights",
      "calendar",
      "social",
      "settings",
    ]);
    expect(checklistFirst.map((tab) => tab.key)).toEqual([
      "insights",
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
