import { describe, expect, it } from "vitest";
import { bandForTotalXp } from "@/lib/xp/altitude";

describe("bandForTotalXp", () => {
  it("returns trailhead for zero", () => {
    const band = bandForTotalXp(0);
    expect(band.id).toBe("trailhead");
    expect(band.progressToNextBand).toBe(0);
  });

  it("moves to the next band at thresholds", () => {
    expect(bandForTotalXp(700).id).toBe("foothills");
    expect(bandForTotalXp(1900).id).toBe("treeline");
    expect(bandForTotalXp(23500).id).toBe("summit");
  });

  it("caps progress at 1 on summit", () => {
    expect(bandForTotalXp(999999).progressToNextBand).toBe(1);
  });
});
