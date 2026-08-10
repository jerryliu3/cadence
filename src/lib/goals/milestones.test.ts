import { describe, expect, it } from "vitest";
import {
  buildMilestoneNameDrafts,
  buildMilestoneNames,
  defaultMilestoneName,
  normalizeMilestoneNamesForSave,
} from "./milestones";

describe("milestones helpers", () => {
  it("builds default milestone labels", () => {
    expect(defaultMilestoneName(0)).toBe("Milestone 1");
    expect(defaultMilestoneName(2)).toBe("Milestone 3");
  });

  it("builds editable milestone drafts from existing values", () => {
    expect(buildMilestoneNameDrafts(3, ["A", "B"])).toEqual(["A", "B", ""]);
    expect(buildMilestoneNameDrafts(0, ["A"])).toEqual([]);
  });

  it("normalizes milestone names for save with defaults", () => {
    expect(normalizeMilestoneNamesForSave(3, ["", " Step ", ""])).toEqual([
      "Milestone 1",
      "Step",
      "Milestone 3",
    ]);
  });

  it("builds read-model milestone names with minimum one item", () => {
    expect(buildMilestoneNames(2, [" One ", ""])).toEqual([
      "One",
      "Milestone 2",
    ]);
    expect(buildMilestoneNames(0, [])).toEqual(["Milestone 1"]);
  });
});
