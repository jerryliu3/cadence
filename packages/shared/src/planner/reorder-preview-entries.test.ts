import { describe, expect, it } from "vitest";
import { reorderPreviewEntryKeys } from "./reorder-preview-entries";

describe("reorderPreviewEntryKeys", () => {
  it("reorders within incomplete and completed groups without crossing them", () => {
    expect(
      reorderPreviewEntryKeys({
        incompleteKeys: ["open-a", "open-b"],
        completedKeys: ["done-a", "done-b"],
        activeEntryKey: "open-b",
        overEntryKey: "open-a",
      })
    ).toEqual(["open-b", "open-a", "done-a", "done-b"]);

    expect(
      reorderPreviewEntryKeys({
        incompleteKeys: ["open-a", "open-b"],
        completedKeys: ["done-a", "done-b"],
        activeEntryKey: "done-b",
        overEntryKey: "done-a",
      })
    ).toEqual(["open-a", "open-b", "done-b", "done-a"]);
  });

  it("preserves an existing order while adding newly visible entries", () => {
    expect(
      reorderPreviewEntryKeys({
        incompleteKeys: ["open-a", "open-b", "open-c"],
        completedKeys: ["done-a"],
        activeEntryKey: "open-b",
        overEntryKey: "open-a",
        existingOrder: ["open-c", "open-a", "open-b", "done-a"],
      })
    ).toEqual(["open-c", "open-b", "open-a", "done-a"]);
  });

  it("returns null for no-op and cross-group drops", () => {
    expect(
      reorderPreviewEntryKeys({
        incompleteKeys: ["open-a"],
        completedKeys: ["done-a"],
        activeEntryKey: "open-a",
        overEntryKey: "open-a",
      })
    ).toBeNull();
    expect(
      reorderPreviewEntryKeys({
        incompleteKeys: ["open-a"],
        completedKeys: ["done-a"],
        activeEntryKey: "open-a",
        overEntryKey: "done-a",
      })
    ).toBeNull();
  });
});
