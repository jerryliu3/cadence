import {
  getXpRefreshRequestDetail as getSharedXpRefreshRequestDetail,
  requestXpRefresh as emitXpRefresh,
  subscribeXpRefresh,
  XP_REFRESH_REQUESTED_EVENT,
  type ViewportRectSnapshot,
  type XpRefreshRequestDetail,
} from "@cadence/shared/xp/events";

export {
  subscribeXpRefresh,
  XP_REFRESH_REQUESTED_EVENT,
  type ViewportRectSnapshot,
  type XpRefreshRequestDetail,
};

export function captureViewportRect(element: Element): ViewportRectSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function requestXpRefresh(detail?: XpRefreshRequestDetail): void {
  emitXpRefresh(detail);
}

export function getXpRefreshRequestDetail(
  event: Event
): XpRefreshRequestDetail | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  return getSharedXpRefreshRequestDetail(event.detail);
}
