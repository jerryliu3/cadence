import { describe, expect, it } from "vitest";
import {
  areMilestoneNamesEqual,
  buildMilestoneNameDrafts,
  buildMilestoneNames,
  defaultMilestoneName,
  getNextMilestoneName,
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

  it("compares milestone name arrays by value", () => {
    expect(areMilestoneNamesEqual(["A", "B"], ["A", "B"])).toBe(true);
    expect(areMilestoneNamesEqual(["A"], ["A", "B"])).toBe(false);
    expect(areMilestoneNamesEqual(["A", "B"], ["A", "C"])).toBe(false);
  });

  it("resolves the next fixed milestone label", () => {
    expect(
      getNextMilestoneName(
        {
          frequency_type: "fixed_milestones",
          target_count: 3,
          milestone_names: ["Kickoff", "Midpoint", "Finish"],
        },
        1
      )
    ).toBe("Midpoint");
    expect(
      getNextMilestoneName(
        {
          frequency_type: "fixed_milestones",
          target_count: 3,
          milestone_names: ["Kickoff", "", "Finish"],
        },
        1
      )
    ).toBe("Milestone 2");
    expect(
      getNextMilestoneName(
        {
          frequency_type: "fixed_milestones",
          target_count: 2,
          milestone_names: ["Draft", "Ship"],
        },
        0
      )
    ).toBe("Draft");
    expect(
      getNextMilestoneName(
        {
          frequency_type: "recurring",
          target_count: 3,
          milestone_names: null,
        },
        0
      )
    ).toBeNull();
    expect(
      getNextMilestoneName(
        {
          frequency_type: "fixed_milestones",
          target_count: 1,
          milestone_names: ["Only"],
        },
        1
      )
    ).toBeNull();
  });
});
