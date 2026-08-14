import { describe, expect, it } from "vitest";
import { bandForTotalXp } from "@/lib/xp/altitude";
import { minTotalXpForLevel } from "@/lib/xp/progression";

describe("bandForTotalXp", () => {
  it("returns trailhead for zero", () => {
    const band = bandForTotalXp(0);
    expect(band.id).toBe("trailhead");
    expect(band.minXp).toBe(minTotalXpForLevel(1));
    expect(band.progressToNextBand).toBe(0);
  });

  it("moves to the next band at level-derived thresholds", () => {
    expect(bandForTotalXp(minTotalXpForLevel(5)).id).toBe("foothills");
    expect(bandForTotalXp(minTotalXpForLevel(7)).id).toBe("treeline");
    expect(bandForTotalXp(minTotalXpForLevel(23)).id).toBe("summit");
  });

  it("caps progress at 1 on summit", () => {
    expect(bandForTotalXp(999999).progressToNextBand).toBe(1);
  });
});
