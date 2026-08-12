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

export function captureViewportRect(
  element: Element
): ViewportRectSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function requestXpRefresh(detail?: XpRefreshRequestDetail): void {
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

  const detail = event.detail as XpRefreshRequestDetail | undefined;
  if (
    !detail ||
    detail.reason !== "completion" ||
    (detail.desiredFactState !== "present" &&
      detail.desiredFactState !== "absent")
  ) {
    return null;
  }

  return detail;
}
