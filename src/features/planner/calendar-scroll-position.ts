const DAY_CELL_SELECTOR = '[data-day-cell="true"][data-day]';

export function getCalendarTargetScrollTop(
  container: HTMLElement,
  target: HTMLElement
) {
  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  return Math.max(0, container.scrollTop + targetTop - containerTop);
}

export function getCalendarTargetScrollLeft(
  container: HTMLElement,
  target: HTMLElement
) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetLeft = container.scrollLeft + targetRect.left - containerRect.left;
  const centeredLeft =
    targetLeft - (container.clientWidth - targetRect.width) / 2;
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  return Math.min(maxScrollLeft, Math.max(0, centeredLeft));
}

export function getTopVisibleCalendarDay(container: HTMLElement) {
  const visibleTop = container.getBoundingClientRect().top + 1;
  const dayCells =
    container.querySelectorAll<HTMLElement>(DAY_CELL_SELECTOR);

  for (const dayCell of dayCells) {
    if (dayCell.getBoundingClientRect().bottom > visibleTop) {
      return dayCell.dataset.day ?? null;
    }
  }

  return null;
}

interface CalendarDayVisibilityOptions {
  checkHorizontal?: boolean;
  checkVertical?: boolean;
  insetPx?: number;
}

export function isCalendarDayVisible(
  container: HTMLElement,
  day: string,
  {
    checkHorizontal = true,
    checkVertical = true,
    insetPx = 1,
  }: CalendarDayVisibilityOptions = {}
) {
  const dayCell = container.querySelector<HTMLElement>(
    `${DAY_CELL_SELECTOR}[data-day="${day}"]`
  );
  if (!dayCell) {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const dayRect = dayCell.getBoundingClientRect();
  if (
    (checkHorizontal && (containerRect.width <= 0 || dayRect.width <= 0)) ||
    (checkVertical && (containerRect.height <= 0 || dayRect.height <= 0))
  ) {
    return true;
  }
  const horizontalVisible =
    !checkHorizontal ||
    (dayRect.right > containerRect.left + insetPx &&
      dayRect.left < containerRect.right - insetPx);
  const verticalVisible =
    !checkVertical ||
    (dayRect.bottom > containerRect.top + insetPx &&
      dayRect.top < containerRect.bottom - insetPx);
  return horizontalVisible && verticalVisible;
}
