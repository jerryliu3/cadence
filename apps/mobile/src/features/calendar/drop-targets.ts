export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SessionDropTarget {
  surfaceKey: string;
  day: string;
  entryKey: string;
  rect: LayoutRect;
}

export interface DayDropTarget {
  surfaceKey: string;
  day: string;
  inMonth: boolean;
  rect: LayoutRect;
}

export function hitTestDropTarget({
  x,
  y,
  days,
  sessions,
  surfaceKey,
  visibleDays,
}: {
  x: number;
  y: number;
  days: DayDropTarget[];
  sessions: SessionDropTarget[];
  surfaceKey: string;
  visibleDays: Iterable<string>;
}):
  | { type: "session"; day: string; entryKey: string }
  | { type: "day"; day: string; inMonth: boolean }
  | null {
  const visibleDaySet = new Set(visibleDays);
  const matchesSurface = (target: { surfaceKey: string; day: string }) =>
    target.surfaceKey === surfaceKey && visibleDaySet.has(target.day);
  const sessionHit = sessions.find(
    (target) => matchesSurface(target) && containsPoint(target.rect, x, y)
  );
  if (sessionHit) {
    return {
      type: "session",
      day: sessionHit.day,
      entryKey: sessionHit.entryKey,
    };
  }
  const dayHit = days.find(
    (target) => matchesSurface(target) && containsPoint(target.rect, x, y)
  );
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

export function measureNodeInWindow(
  node: {
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void
    ) => void;
  } | null,
  onRect: (rect: LayoutRect) => void
) {
  node?.measureInWindow?.((x, y, width, height) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    onRect({ x, y, width, height });
  });
}
