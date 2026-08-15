export interface ViewportRectSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface XpRefreshRequestDetail {
  reason: "completion";
  desiredFactState: "present" | "absent";
  sourceRect?: ViewportRectSnapshot;
}

type XpRefreshListener = (detail?: XpRefreshRequestDetail) => void;

const listeners = new Set<XpRefreshListener>();

export function subscribeXpRefresh(listener: XpRefreshListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestXpRefresh(detail?: XpRefreshRequestDetail): void {
  for (const listener of listeners) {
    listener(detail);
  }
}

export function captureViewportRect(element: Element): ViewportRectSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}
