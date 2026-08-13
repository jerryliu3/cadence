import {
  getXpRefreshRequestDetail as getSharedXpRefreshRequestDetail,
  requestXpRefresh as emitXpRefresh,
  XP_REFRESH_REQUESTED_EVENT,
  type ViewportRectSnapshot,
  type XpRefreshRequestDetail,
} from "@cadence/shared/xp/events";

export {
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
  if (typeof window === "undefined") {
    return;
  }

  if (detail) {
    window.dispatchEvent(
      new CustomEvent<XpRefreshRequestDetail>(XP_REFRESH_REQUESTED_EVENT, {
        detail,
      })
    );
    return;
  }

  window.dispatchEvent(new CustomEvent(XP_REFRESH_REQUESTED_EVENT));
}

export function getXpRefreshRequestDetail(
  event: Event
): XpRefreshRequestDetail | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  return getSharedXpRefreshRequestDetail(event.detail);
}
