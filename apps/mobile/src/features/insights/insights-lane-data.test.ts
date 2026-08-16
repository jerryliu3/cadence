import { describe, expect, it } from "vitest";
import {
  buildInsightsLaneQueryKey,
  buildInsightsMonthWindow,
  buildInsightsProgressQuery,
  countInsightsFactsByDay,
  summarizeInsightsMonth,
} from "./insights-lane-data";

describe("insights lane data helpers", () => {
  it("builds stable month windows shared by both lanes", () => {
    expect(buildInsightsMonthWindow("2026-02")).toEqual({
      factsFrom: "2026-02-01",
      factsTo: "2026-02-28",
    });
  });

  it("uses the same month bounds for viewer and partner keys", () => {
    const viewerKey = buildInsightsLaneQueryKey({
      viewerUserId: "viewer-1",
      subject: { id: "viewer", label: "Mine", readOnly: false, userId: "viewer-1" },
      month: "2026-08",
    });
    const partnerKey = buildInsightsLaneQueryKey({
      viewerUserId: "viewer-1",
      subject: {
        id: "partner",
        label: "Alex",
        readOnly: true,
        userId: "partner-1",
      },
      month: "2026-08",
    });

    expect(viewerKey.slice(-2)).toEqual(partnerKey.slice(-2));
    expect(viewerKey[2]).toBe("viewer-1");
    expect(partnerKey[2]).toBe("partner-1");
  });

  it("omits subjectUserId for viewer insights requests", () => {
    const query = buildInsightsProgressQuery({
      asOfDate: "2026-08-15",
      timezone: "UTC",
      subject: { id: "viewer", label: "Mine", readOnly: false, userId: "viewer-1" },
      month: "2026-08",
    });

    expect(query.get("subjectUserId")).toBeNull();
    expect(query.get("factsFrom")).toBe("2026-08-01");
    expect(query.get("factsTo")).toBe("2026-08-31");
  });

  it("includes subjectUserId for partner insights requests", () => {
    const query = buildInsightsProgressQuery({
      asOfDate: "2026-08-15",
      timezone: "UTC",
      subject: {
        id: "partner",
        label: "Alex",
        readOnly: true,
        userId: "partner-1",
      },
      month: "2026-08",
    });

    expect(query.get("subjectUserId")).toBe("partner-1");
  });

  it("counts facts by day for heatmap cells", () => {
    expect(
      countInsightsFactsByDay([
        { goal_id: "a", completed_on: "2026-08-01", source: "manual" },
        { goal_id: "b", completed_on: "2026-08-01", source: "linked_cascade" },
        { goal_id: "c", completed_on: "2026-08-03", source: "manual" },
      ])
    ).toEqual({
      "2026-08-01": 2,
      "2026-08-03": 1,
    });
  });

  it("summarizes monthly activity from day counts", () => {
    expect(
      summarizeInsightsMonth({
        "2026-08-01": 2,
        "2026-08-03": 1,
        "2026-08-05": 4,
      })
    ).toEqual({
      totalActivities: 7,
      activeDays: 3,
      peakDayActivities: 4,
    });
  });

  it("returns an empty summary when there are no completions", () => {
    expect(summarizeInsightsMonth({})).toEqual({
      totalActivities: 0,
      activeDays: 0,
      peakDayActivities: 0,
    });
  });
});
