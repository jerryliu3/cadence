const DAY_CELL_SELECTOR = '[data-day-cell="true"][data-day]';

export function getCalendarTargetScrollTop(
  container: HTMLElement,
  target: HTMLElement
) {
  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  return Math.max(0, container.scrollTop + targetTop - containerTop);
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
