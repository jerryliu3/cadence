import { describe, expect, it } from "vitest";
import {
  buildStarterPackRows,
  resolveStarterPackKey,
} from "@/features/goals/starter-packs";

describe("starter packs", () => {
  it("resolves only supported starter pack keys", () => {
    expect(resolveStarterPackKey("health")).toBe("health");
    expect(resolveStarterPackKey("fitness")).toBe("fitness");
    expect(resolveStarterPackKey("finance")).toBeNull();
    expect(resolveStarterPackKey(null)).toBeNull();
  });

  it("builds three goals for health and fitness packs", () => {
    const healthRows = buildStarterPackRows("health", "2026-08-01");
    const fitnessRows = buildStarterPackRows("fitness", "2026-08-01");

    expect(healthRows).toHaveLength(3);
    expect(fitnessRows).toHaveLength(3);

    expect(
      healthRows.every((row) => row.frequency_type === "recurring")
    ).toBe(true);
    expect(
      fitnessRows.some((row) => row.frequency_type === "fixed_milestones")
    ).toBe(true);
  });
});
