import { createHash } from "node:crypto";

export interface PlannerCalendarFeedItem {
  goalId: string;
  goalTitle: string;
  goalDefaultLocalTime: string | null;
  scheduledDate: string;
  scheduledTimeOverride: string | null;
  unitKey: string;
}

export const ICS_FEED_LOOKBACK_DAYS = 30;
export const ICS_FEED_LOOKAHEAD_DAYS = 366;

const ICS_LINE_LIMIT = 75;

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function foldLine(value: string) {
  const source = Buffer.from(value, "utf8");
  if (source.length <= ICS_LINE_LIMIT) {
    return value;
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const contentLimit = offset === 0 ? ICS_LINE_LIMIT : ICS_LINE_LIMIT - 1;
    let sliceEnd = Math.min(offset + contentLimit, source.length);
    while (sliceEnd > offset && (source[sliceEnd] & 0xc0) === 0x80) {
      sliceEnd -= 1;
    }
    if (sliceEnd === offset) {
      sliceEnd = Math.min(offset + contentLimit, source.length);
    }
    chunks.push(source.subarray(offset, sliceEnd).toString("utf8"));
    offset = sliceEnd;
  }
  return chunks.join("\r\n ");
}

function formatUtcStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDate(localDate: string) {
  return localDate.replaceAll("-", "");
}

function formatLocalDateTime(localDate: string, localTime: string) {
  const compactDate = formatDate(localDate);
  const compactTime = localTime.replace(":", "");
  return `${compactDate}T${compactTime}00`;
}

function buildStableUid({ goalId, unitKey }: { goalId: string; unitKey: string }) {
  const digest = createHash("sha256").update(`${goalId}:${unitKey}`).digest("hex");
  return `${digest.slice(0, 32)}@cadence.app`;
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

export function buildPlannerCalendarIcs({
  generatedAt,
  items,
}: {
  generatedAt: Date;
  items: PlannerCalendarFeedItem[];
}) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cadence//Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Cadence",
  ];

  const dtStamp = formatUtcStamp(generatedAt);
  const sortedItems = [...items].sort((left, right) => {
    if (left.scheduledDate !== right.scheduledDate) {
      return left.scheduledDate.localeCompare(right.scheduledDate);
    }
    if (left.goalId !== right.goalId) {
      return left.goalId.localeCompare(right.goalId);
    }
    return left.unitKey.localeCompare(right.unitKey);
  });

  for (const item of sortedItems) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${buildStableUid({ goalId: item.goalId, unitKey: item.unitKey })}`);
    lines.push(`DTSTAMP:${dtStamp}`);

    const effectiveLocalTime = item.scheduledTimeOverride ?? item.goalDefaultLocalTime;
    if (effectiveLocalTime) {
      lines.push(
        `DTSTART:${formatLocalDateTime(item.scheduledDate, effectiveLocalTime)}`
      );
      lines.push("DURATION:PT30M");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(item.scheduledDate)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(item.goalTitle)}`);
    lines.push(`DESCRIPTION:${escapeIcsText("Planned in Cadence")}`);
    lines.push(`X-CADENCE-UNIT-KEY:${escapeIcsText(item.unitKey)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n").concat("\r\n");
}

export function createIcsEtag(icsBody: string) {
  return `"${createHash("sha256").update(icsBody).digest("hex")}"`;
}

export function createPlannerFeedEtag(items: PlannerCalendarFeedItem[]) {
  return createIcsEtag(
    buildPlannerCalendarIcs({
      generatedAt: new Date(0),
      items,
    })
  );
}
