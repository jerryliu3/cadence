import { describe, expect, it } from "vitest";
import {
  buildCalendarMonthCellAccessibilityLabel,
  buildCalendarMonthMarkerModel,
  buildCalendarOverlayQueryModel,
  buildCalendarPartnerOverlayPayload,
  buildCalendarPartnerTitleMap,
  buildCalendarPartnerProgressQuery,
  buildPartnerMarkerAccessibilityLabel,
  resolveCalendarOverlayState,
  resolveCalendarReadOnlyState,
} from "./calendar-duo";

describe("calendar duo behavior helpers", () => {
  it("builds partner progress query from shared month-grid bounds", () => {
    const query = buildCalendarPartnerProgressQuery({
      month: "2026-08",
      asOfDate: "2026-08-14",
      timezone: "UTC",
      partnerId: "partner-1",
    });

    expect(query).not.toBeNull();
    expect(query?.get("factsFrom")).toBe("2026-07-26");
    expect(query?.get("factsTo")).toBe("2026-09-11");
    expect(query?.get("subjectUserId")).toBe("partner-1");
  });

  it("returns null query params when month is invalid", () => {
    const query = buildCalendarPartnerProgressQuery({
      month: "nope",
      asOfDate: "2026-08-14",
      timezone: "UTC",
      partnerId: "partner-1",
    });

    expect(query).toBeNull();
  });

  it("enforces partner read-only controls in scope matrix", () => {
    expect(resolveCalendarReadOnlyState("me")).toEqual({
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    });
    expect(resolveCalendarReadOnlyState("both")).toEqual({
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    });
    expect(resolveCalendarReadOnlyState("partner")).toEqual({
      showViewerSessions: false,
      allowMutations: false,
      banner: "Partner completions (read-only)",
    });
  });

  it("disables partner overlay query in mine scope or without partner", () => {
    const mineScopeModel = buildCalendarOverlayQueryModel({
      viewerUserId: "viewer-1",
      enabled: false,
      partnerId: "partner-1",
      month: "2026-08",
      asOfDate: "2026-08-14",
      timezone: "UTC",
    });
    const noPartnerModel = buildCalendarOverlayQueryModel({
      viewerUserId: "viewer-1",
      enabled: true,
      partnerId: null,
      month: "2026-08",
      asOfDate: "2026-08-14",
      timezone: "UTC",
    });
    expect(mineScopeModel.queryEnabled).toBe(false);
    expect(noPartnerModel.queryEnabled).toBe(false);
  });

  it("builds a stable overlay key with viewer, partner, month, date, and timezone", () => {
    const model = buildCalendarOverlayQueryModel({
      viewerUserId: "viewer-1",
      enabled: true,
      partnerId: "partner-1",
      month: "2026-08",
      asOfDate: "2026-08-14",
      timezone: "America/New_York",
    });

    expect(model.queryKey).toEqual([
      "mobile-calendar-overlay",
      "viewer-1",
      "partner-1",
      "2026-08",
      "2026-08-14",
      "America/New_York",
    ]);
    expect(model.progressParams?.get("factsFrom")).toBe("2026-07-26");
    expect(model.progressParams?.get("factsTo")).toBe("2026-09-11");
  });

  it("maps partner goal titles and keeps non-partner rows out as defense", () => {
    const titleMap = buildCalendarPartnerTitleMap({
      partnerId: "partner-1",
      rows: [
        { id: "goal-a", owner_id: "partner-1", title: "Run" },
        { id: "goal-b", owner_id: "partner-1", title: "Read" },
        { id: "goal-c", owner_id: "viewer-1", title: "Ignore" },
      ],
    });

    expect(titleMap).toEqual({
      "goal-a": "Run",
      "goal-b": "Read",
    });
  });

  it("builds overlay payload markers with partner title mapping", () => {
    const payload = buildCalendarPartnerOverlayPayload({
      partnerId: "partner-1",
      month: "2026-08",
      facts: [
        { goal_id: "goal-b", completed_on: "2026-08-12", source: "manual" },
        { goal_id: "goal-a", completed_on: "2026-08-12", source: "manual" },
      ],
      goalRows: [
        { id: "goal-a", owner_id: "partner-1", title: "Read" },
        { id: "goal-b", owner_id: "partner-1", title: "Run" },
      ],
    });

    const dayMarkers = payload.markersByDate.get("2026-08-12") ?? [];
    expect(dayMarkers.map((marker) => marker.goalTitle)).toEqual(["Read", "Run"]);
  });

  it("fails closed while the current partner-month identity is not fresh", () => {
    const staleMap = new Map([
      [
        "2026-08-14",
        [
          {
            key: "partner:g1:2026-08-14:manual",
            originalGoalId: "g1",
            unitKey: "partner-fact",
            goalTitle: "Run",
            scheduledDate: "2026-08-14",
            owner: "partner" as const,
          },
        ],
      ],
    ]);
    const state = resolveCalendarOverlayState({
      overlayEnabled: true,
      partnerId: "partner-2",
      month: "2026-09",
      data: {
        partnerId: "partner-1",
        month: "2026-08",
        markersByDate: staleMap,
      },
      loading: true,
      error: null,
    });

    expect(state.markersByDate).toEqual(new Map());
    expect(state.error).toBeNull();
  });

  it("returns empty markers and an unavailable message on partner fetch error", () => {
    const state = resolveCalendarOverlayState({
      overlayEnabled: true,
      partnerId: "partner-1",
      month: "2026-08",
      data: null,
      loading: false,
      error: new Error("boom"),
    });

    expect(state.markersByDate).toEqual(new Map());
    expect(state.error).toBe("Partner completions are unavailable.");
  });

  it("builds accessible marker copy with the goal title", () => {
    expect(buildPartnerMarkerAccessibilityLabel("Read")).toBe(
      "Read. Partner marked this done."
    );
  });

  it("builds month marker overflow and aggregate accessibility label", () => {
    const markerModel = buildCalendarMonthMarkerModel({
      markers: [
        {
          key: "partner:a",
          originalGoalId: "a",
          unitKey: "partner-fact",
          goalTitle: "Read",
          scheduledDate: "2026-08-14",
          owner: "partner",
        },
        {
          key: "partner:b",
          originalGoalId: "b",
          unitKey: "partner-fact",
          goalTitle: "Run",
          scheduledDate: "2026-08-14",
          owner: "partner",
        },
        {
          key: "partner:c",
          originalGoalId: "c",
          unitKey: "partner-fact",
          goalTitle: "Hydrate",
          scheduledDate: "2026-08-14",
          owner: "partner",
        },
      ],
      maxVisible: 2,
    });

    expect(markerModel.visibleMarkers.map((marker) => marker.goalTitle)).toEqual([
      "Read",
      "Run",
    ]);
    expect(markerModel.overflowCount).toBe(1);
    expect(
      buildCalendarMonthCellAccessibilityLabel({
        day: "2026-08-14",
        includeViewerSessionClause: true,
        viewerSessionCount: 1,
        overlayActive: true,
        partnerMarkers: markerModel.visibleMarkers,
        partnerOverflowCount: markerModel.overflowCount,
      })
    ).toContain("Partner completions: Read, Run plus 1 more partner completion");
  });

  it("omits partner clause when overlay is inactive", () => {
    expect(
      buildCalendarMonthCellAccessibilityLabel({
        day: "2026-08-14",
        includeViewerSessionClause: true,
        viewerSessionCount: 2,
        overlayActive: false,
        partnerMarkers: [],
        partnerOverflowCount: 0,
      })
    ).toBe("2026-08-14. 2 viewer sessions.");
  });

  it("omits viewer session clause when viewer sessions are hidden", () => {
    expect(
      buildCalendarMonthCellAccessibilityLabel({
        day: "2026-08-14",
        includeViewerSessionClause: false,
        viewerSessionCount: 0,
        overlayActive: true,
        partnerMarkers: [],
        partnerOverflowCount: 0,
      })
    ).toBe("2026-08-14. No partner completions shown.");
  });
});
