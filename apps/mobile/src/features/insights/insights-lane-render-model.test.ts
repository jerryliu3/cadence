import { describe, expect, it } from "vitest";
import type { DuoLaneSubject } from "@cadence/shared/social/duo";
import { buildInsightsLaneRenderModel } from "./insights-lane-render-model";

const viewerLane: DuoLaneSubject = { id: "viewer", label: "Mine", readOnly: false };
const partnerLane: DuoLaneSubject = {
  id: "partner",
  label: "Alex",
  readOnly: true,
  userId: "partner-1",
};

describe("buildInsightsLaneRenderModel", () => {
  it("keeps heading metadata for viewer errors in both scope", () => {
    const model = buildInsightsLaneRenderModel({
      scope: "both",
      lane: viewerLane,
      loading: false,
      error: new Error("viewer failed"),
    });

    expect(model.heading).toEqual({ label: "Mine", readOnly: false });
    expect(model.status).toBe("error");
  });

  it("keeps heading metadata for viewer errors in partner scope fallback", () => {
    const model = buildInsightsLaneRenderModel({
      scope: "partner",
      lane: viewerLane,
      loading: false,
      error: new Error("fallback failed"),
    });

    expect(model.heading).toEqual({ label: "Mine", readOnly: false });
    expect(model.status).toBe("error");
  });

  it("uses partner-unavailable status only for partner errors", () => {
    const model = buildInsightsLaneRenderModel({
      scope: "both",
      lane: partnerLane,
      loading: false,
      error: new Error("partner failed"),
    });

    expect(model.heading).toEqual({ label: "Alex", readOnly: true });
    expect(model.status).toBe("partner_unavailable");
  });
});
