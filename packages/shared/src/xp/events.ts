export const XP_REFRESH_REQUESTED_EVENT = "xp:refresh-requested";

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

export function getXpRefreshRequestDetail(
  detail: unknown
): XpRefreshRequestDetail | null {
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const candidate = detail as XpRefreshRequestDetail;
  if (
    candidate.reason !== "completion" ||
    (candidate.desiredFactState !== "present" &&
      candidate.desiredFactState !== "absent")
  ) {
    return null;
  }

  return candidate;
}
