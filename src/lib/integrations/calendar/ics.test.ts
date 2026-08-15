import { describe, expect, it } from "vitest";
import {
  buildPlannerCalendarIcs,
  createIcsEtag,
  createPlannerFeedEtag,
  shiftIsoDate,
} from "@/lib/integrations/calendar/ics";

const sampleItem = {
  goalId: "11111111-1111-4111-8111-111111111111",
  unitKey: "milestone:1",
  goalTitle: "Ride 40 miles",
  scheduledDate: "2026-08-20",
  scheduledTimeOverride: "07:30",
  goalDefaultLocalTime: null,
};

describe("planner calendar ics", () => {
  it("renders timed and all-day events", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.000Z"),
      items: [
        sampleItem,
        {
          goalId: "22222222-2222-4222-8222-222222222222",
          unitKey: "cadence:2026-08-20",
          goalTitle: "Read",
          scheduledDate: "2026-08-20",
          scheduledTimeOverride: null,
          goalDefaultLocalTime: null,
        },
      ],
    });

    expect(ics).toContain("DTSTART:20260820T073000");
    expect(ics).toContain("DURATION:PT30M");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
    expect(ics).toContain("DTSTAMP:20260814T123456Z");
  });

  it("drops fractional seconds from DTSTAMP", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.789Z"),
      items: [sampleItem],
    });

    expect(ics).toContain("DTSTAMP:20260814T123456Z");
    expect(ics).not.toContain(".789");
  });

  it("escapes summary text and folds long lines on octet boundaries", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.000Z"),
      items: [
        {
          ...sampleItem,
          goalTitle:
            "Build, test; and iterate while keeping a very long summary that exceeds the fold limit in one line",
          scheduledTimeOverride: null,
        },
      ],
    });

    expect(ics).toContain("SUMMARY:Build\\, test\\; and iterate");
    expect(ics).toContain("\r\n ");
  });

  it("does not split multi-byte characters when folding", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.000Z"),
      items: [
        {
          ...sampleItem,
          goalTitle: `${"a".repeat(60)}🎉🎉🎉🎉🎉`,
          scheduledTimeOverride: null,
        },
      ],
    });

    expect(ics).toContain("🎉");
    expect(ics).not.toContain("\uFFFD");
  });

  it("creates stable quoted etags independent of DTSTAMP", () => {
    const etag = createIcsEtag("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(etag.startsWith("\"")).toBe(true);
    expect(etag.endsWith("\"")).toBe(true);
    expect(
      createPlannerFeedEtag([sampleItem])
    ).toBe(createPlannerFeedEtag([sampleItem]));
  });

  it("shifts ISO calendar dates in UTC", () => {
    expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDate("2026-08-14", 366)).toBe("2027-08-15");
  });
});
