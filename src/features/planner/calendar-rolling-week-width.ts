export const ROLLING_WEEK_GRID_WIDTH_BY_VIEW: Record<"day" | "three_day", string> = {
  day: "[--rolling-week-cell-width:calc((100%-1rem)/2)] md:[--rolling-week-cell-width:calc((100%-1.5rem)/3)] xl:[--rolling-week-cell-width:calc((100%-2rem)/4)]",
  three_day:
    "[--rolling-week-cell-width:calc((100%-0.5rem)/1.6)] md:[--rolling-week-cell-width:calc((100%-1rem)/2.4)] xl:[--rolling-week-cell-width:calc((100%-0.5rem)/3.1)]",
};
