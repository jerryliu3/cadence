import { describe, expect, it } from "vitest";
import {
  STARTER_PACKS,
  buildStarterPackRows,
  resolveStarterPackKey,
} from "@/features/goals/starter-packs";

describe("starter packs", () => {
  it("resolves only supported starter pack keys", () => {
    for (const pack of STARTER_PACKS) {
      expect(resolveStarterPackKey(pack.key)).toBe(pack.key);
    }
    expect(resolveStarterPackKey("finance")).toBeNull();
    expect(resolveStarterPackKey(null)).toBeNull();
  });

  it("offers at least one pack per requested category", () => {
    expect(STARTER_PACKS.map((pack) => pack.key)).toEqual([
      "health",
      "fitness",
      "career",
      "personal",
      "relationships",
    ]);
  });

  it("builds three goals per starter pack", () => {
    for (const pack of STARTER_PACKS) {
      const rows = buildStarterPackRows(pack.key, "2026-08-01");
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.start_date === "2026-08-01")).toBe(true);
    }
  });

  it("keeps milestone variety where expected", () => {
    const fitnessRows = buildStarterPackRows("fitness", "2026-08-01");
    const careerRows = buildStarterPackRows("career", "2026-08-01");
    const relationshipRows = buildStarterPackRows("relationships", "2026-08-01");

    expect(
      fitnessRows.some((row) => row.frequency_type === "fixed_milestones")
    ).toBe(true);
    expect(
      careerRows.some((row) => row.frequency_type === "fixed_milestones")
    ).toBe(true);
    expect(
      relationshipRows.some((row) => row.category === "Relationships")
    ).toBe(true);
  });
});
