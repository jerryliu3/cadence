import { describe, expect, it } from "vitest";
import {
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
      readOnly: false,
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    });
    expect(resolveCalendarReadOnlyState("both")).toEqual({
      readOnly: false,
      showViewerSessions: true,
      allowMutations: true,
      banner: null,
    });
    expect(resolveCalendarReadOnlyState("partner")).toEqual({
      readOnly: true,
      showViewerSessions: false,
      allowMutations: false,
      banner: "Partner completions (read-only)",
    });
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
      "Read. Partner marked it done."
    );
  });
});
