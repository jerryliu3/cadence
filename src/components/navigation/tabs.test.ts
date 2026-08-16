import { describe, expect, it } from "vitest";
import { buildAppTabs } from "@/components/navigation/tabs";

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
});
