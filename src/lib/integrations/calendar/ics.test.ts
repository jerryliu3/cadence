import { describe, expect, it } from "vitest";
import { buildPlannerCalendarIcs, createIcsEtag } from "@/lib/integrations/calendar/ics";

describe("planner calendar ics", () => {
  it("renders timed and all-day events", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.000Z"),
      items: [
        {
          goalId: "11111111-1111-4111-8111-111111111111",
          unitKey: "milestone:1",
          goalTitle: "Ride 40 miles",
          scheduledDate: "2026-08-20",
          scheduledTimeOverride: "07:30",
          goalDefaultLocalTime: null,
        },
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
  });

  it("escapes summary text and folds long lines", () => {
    const ics = buildPlannerCalendarIcs({
      generatedAt: new Date("2026-08-14T12:34:56.000Z"),
      items: [
        {
          goalId: "11111111-1111-4111-8111-111111111111",
          unitKey: "milestone:1",
          goalTitle:
            "Build, test; and iterate while keeping a very long summary that exceeds the fold limit in one line",
          scheduledDate: "2026-08-20",
          scheduledTimeOverride: null,
          goalDefaultLocalTime: null,
        },
      ],
    });

    expect(ics).toContain("SUMMARY:Build\\, test\\; and iterate");
    expect(ics).toContain("\r\n ");
  });

  it("creates stable quoted etags", () => {
    const etag = createIcsEtag("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(etag.startsWith("\"")).toBe(true);
    expect(etag.endsWith("\"")).toBe(true);
  });
});
