import type { ShareMenuPosition } from "./social-models";

export function buildShareMenuPosition({
  anchorRect,
  viewportWidth,
  viewportHeight,
  viewportPadding = 12,
  gap = 8,
}: {
  anchorRect: DOMRect;
  viewportWidth: number;
  viewportHeight: number;
  viewportPadding?: number;
  gap?: number;
}): ShareMenuPosition {
  const availableBelow =
    viewportHeight - anchorRect.bottom - gap - viewportPadding;
  const availableAbove = anchorRect.top - gap - viewportPadding;
  const shouldOpenAbove = availableBelow < 220 && availableAbove > availableBelow;
  const width = Math.min(anchorRect.width, viewportWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(anchorRect.left, viewportPadding),
    viewportWidth - width - viewportPadding
  );
  const maxHeight = Math.max(
    160,
    shouldOpenAbove ? availableAbove : availableBelow
  );

  if (shouldOpenAbove) {
    return {
      left,
      width,
      maxHeight,
      top: undefined,
      bottom: viewportHeight - anchorRect.top + gap,
    };
  }

  return {
    left,
    width,
    maxHeight,
    top: anchorRect.bottom + gap,
    bottom: undefined,
  };
}
