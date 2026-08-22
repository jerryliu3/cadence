# Landing Hero and Story Polish Design

## Objective

Make the landing hero more product-led, reduce copy and vertical whitespace, demonstrate both weekly and monthly planning in one continuous loop, and explain why Goalmaxxing exists.

## Hero

At desktop widths, use a one-third text and two-thirds planner layout. Mobile remains a single stacked column.

Use this headline:

> Achieve your goals using one focused system.

Use this two-line supporting message:

> Plan beyond daily habits. Connect today's actions to the weeks and months ahead.

Keep `Go to app` as the primary CTA. Add a secondary `Read story` CTA linking to `#why-goalmaxxing`.

## Planner demonstration

The planner preview remains self-contained marketing UI and does not import authenticated planner state or mutation behavior.

Use one unified phase sequence:

`editing → lifting → moving → settling → saving → saved → opening-month-menu → selecting-month → month → opening-week-menu → selecting-week → editing`

The current lifted-arc Strength movement remains unchanged through the saved phase. After saving:

1. The view selector opens.
2. The Month option visibly highlights as if selected.
3. The preview transitions to a seeded monthly calendar.
4. The month view remains visible long enough to understand.
5. The selector opens again.
6. The Week option visibly highlights as if selected.
7. The weekly view returns and the loop restarts.

The selector visually matches a compact product dropdown. It is part of the automatic demonstration, not a real form control. Screen readers receive concise view/status updates without being exposed to a misleading interactive menu.

The monthly calendar shows a conventional seven-column grid with seeded activity on multiple dates. Use compact dots or short labels rather than dense explanatory text.

The loop runs only while the preview is visible and honors reduced motion. Reduced-motion behavior skips task travel and dropdown movement but still progresses through weekly, saved, and monthly states.

Remove redundant planner text:

- Keep the title and compact status badge.
- Remove the secondary header subtitle.
- Replace the two-line status panel with one concise live status line.

## Feature narrative sizing

Keep deterministic 1 → 2 → 3 scroll activation and equal left/right panel heights.

Reduce desktop panel height from `60vh` to `clamp(280px, 38vh, 360px)`. Reduce excessive internal vertical spacing while preserving all content. Mobile panels use natural content height with a practical minimum.

## Why Goalmaxxing

Add a section after the feature narrative with `id="why-goalmaxxing"`.

Use the heading:

> Most productivity apps stop at today.

Use concise supporting copy explaining that real goals change week to week, require planning ahead, and benefit from accountability.

Present three frustrations:

1. **Too habit-focused** — Streaks reward repetition, not meaningful outcomes.
2. **Too rigid** — Real goals do not always follow fixed daily patterns.
3. **Too isolated** — Progress is harder without shared accountability.

Close with:

> Goalmaxxing connects flexible planning, measurable progress, and trusted accountability—across today, next week, and the months ahead.

The existing final CTA remains after this section.

## Component boundaries

- `LandingPage` owns hero copy, CTA placement, section ordering, final CTA, and footer.
- `LandingPlannerPreview` owns the unified weekly/monthly demonstration.
- `LandingFeatureNarrative` owns compact deterministic scroll scenes.
- Add a static `LandingWhyGoalmaxxing` component only if extraction keeps `LandingPage` materially clearer.

## Verification

- Extend phase tests to cover the full weekly → monthly → weekly sequence.
- Test reduced-motion phase progression.
- Update landing E2E assertions for the headline, `Read story` anchor, and story heading.
- Keep existing accessibility coverage.
- Run focused unit tests, changed-file lint, typecheck, and the public landing Playwright suite.
