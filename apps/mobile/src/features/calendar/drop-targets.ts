export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SessionDropTarget {
  day: string;
  entryKey: string;
  rect: LayoutRect;
}

export interface DayDropTarget {
  day: string;
  inMonth: boolean;
  rect: LayoutRect;
}

export function hitTestDropTarget({
  x,
  y,
  days,
  sessions,
}: {
  x: number;
  y: number;
  days: DayDropTarget[];
  sessions: SessionDropTarget[];
}):
  | { type: "session"; day: string; entryKey: string }
  | { type: "day"; day: string; inMonth: boolean }
  | null {
  const sessionHit = sessions.find((target) => containsPoint(target.rect, x, y));
  if (sessionHit) {
    return {
      type: "session",
      day: sessionHit.day,
      entryKey: sessionHit.entryKey,
    };
  }
  const dayHit = days.find((target) => containsPoint(target.rect, x, y));
  if (dayHit) {
    return { type: "day", day: dayHit.day, inMonth: dayHit.inMonth };
  }
  return null;
}

function containsPoint(rect: LayoutRect, x: number, y: number) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}
