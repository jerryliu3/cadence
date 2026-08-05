export interface DayPreviewPosition {
  top: number;
  left: number;
  width: number;
  placement: "above" | "below";
}

export function computeDayPreviewPosition({
  rect,
  viewportWidth,
  viewportHeight,
}: {
  rect: { top: number; left: number; width: number; height: number };
  viewportWidth: number;
  viewportHeight: number;
}): DayPreviewPosition {
  const popupWidth = 320;
  const preferredPopupHeight = 220;
  const spacing = 8;
  const availableAbove = rect.top - spacing;
  const availableBelow = viewportHeight - (rect.top + rect.height) - spacing;
  const placement =
    availableAbove >= preferredPopupHeight || availableAbove >= availableBelow
      ? "above"
      : "below";

  const preferredLeft = rect.left + rect.width / 2 - popupWidth / 2;

  const left = Math.max(
    spacing,
    Math.min(preferredLeft, viewportWidth - popupWidth - spacing)
  );
  const top = placement === "above" ? rect.top - spacing : rect.top + rect.height + spacing;

  return {
    top,
    left,
    width: popupWidth,
    placement,
  };
}
