# Landing Interaction Polish Design

## Objective

Refine the interactive landing page so its message is broader, its scroll narrative progresses predictably, and its planner demonstration shows a task physically moving between dates before the plan saves.

## Scope

### Hero copy

Replace the hero heading with:

> Achieve all your goals from one focused and flexible system.

No other hero CTA or navigation behavior changes in this follow-up.

### Scroll-driven feature narrative

The feature narrative remains three ordered scenes:

1. Plan with clarity
2. Track real progress
3. Stay accountable

Each narrative card and the sticky visualization use the same viewport-relative height on desktop. The left column provides three equal activation regions; the right visualization remains sticky for the full narrative and releases naturally after the third card.

Scene selection uses one viewport anchor rather than competing `IntersectionObserver` entry ratios. On scroll, the card whose center is nearest the anchor becomes active. The calculation is deterministic, so downward scrolling progresses 1 → 2 → 3 and upward scrolling reverses 3 → 2 → 1. The third scene receives enough parent-section runway to become active and remain visible before the sticky visualization releases.

On smaller screens, the cards and visuals remain in document flow and do not require sticky behavior.

### Planner tile text

Use short seeded task labels that fit the compact seven-day calendar. Task tiles permit normal whole-word wrapping and must not clip partial letters or words. Labels remain realistic but concise, such as `Focus`, `Goal review`, `Strength`, `Roadmap`, `Tempo run`, `Launch copy`, `Update`, and `Weekly review`.

### Lifted-arc task movement

The demo moves `Strength` from Tuesday to Thursday using a measured floating overlay:

1. Render the task in Tuesday during the editing state.
2. Measure the source task and destination slot relative to the calendar container.
3. Hide the source task while rendering an equivalent floating task above the grid.
4. Lift the floating task, move it along a shallow upward arc, and settle it into Thursday.
5. Replace the floating task with the real Thursday task.
6. Change status to `Saving…`, then `Saved`.
7. Hold briefly and reset to the editing state.

The loop runs only while the planner preview is visible. It pauses offscreen and resumes cleanly without accumulating timers. Users who prefer reduced motion see the same editing, saving, and saved states without the travel animation.

The landing animation is self-contained and does not reuse the authenticated planner's drag-and-drop mutation or persistence code.

## Component boundaries

Keep the page composition readable by extracting focused landing-only units from the existing large component:

- `LandingPlannerPreview`: owns visibility detection, animation phase, task measurement, and seeded calendar rendering.
- `LandingFeatureNarrative`: owns deterministic scroll activation and the paired narrative/visual layout.
- `landing-data`: owns static feature scene and seeded week definitions if extraction materially improves readability.

The root `LandingPage` remains responsible for page composition, hero copy, CTAs, final CTA, and footer.

## State and data flow

The planner preview uses an explicit phase sequence rather than swapping complete snapshots:

`editing → lifting → moving → settling → saving → saved → editing`

The current phase determines task placement, floating-overlay visibility, and save status. A single scheduled phase transition is active at any time and is cleaned up whenever visibility changes or the component unmounts.

The feature narrative maintains one active scene index derived from scroll position. Static scene data selects the corresponding right-side visual.

## Accessibility and resilience

- Honor `prefers-reduced-motion`.
- Keep all meaningful seeded text present in the DOM.
- Do not require pointer interaction to understand either demo.
- Preserve color contrast and existing keyboard-accessible CTAs.
- Treat animation as progressive enhancement; content remains understandable if measurement is temporarily unavailable.

## Verification

- Add component tests for the planner phase sequence using controlled timers.
- Verify the moving task changes from Tuesday to Thursday and reaches `Saved`.
- Verify reduced-motion behavior skips travel while retaining state changes.
- Add a deterministic scene-selection unit test for ordered 1 → 2 → 3 activation.
- Update landing end-to-end copy assertions.
- Run changed-file lint and landing-focused Playwright accessibility checks.
