# Landing Product Tour Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the landing planner preview, swap the Week and Month demo actions, and add accurate product-tour and experimental bento sections without removing the existing narrative scenes.

**Architecture:** Keep `LandingPage` as a composition shell. `LandingPlannerPreview` owns one deterministic visibility-aware animation state machine; `LandingFeatureNarrative` remains the scroll-driven outcome story; new focused components own the concrete product tour and experimental bento. All visuals use local seed data and never call authenticated APIs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, motion/react, Lucide icons, Vitest/Testing Library, Playwright/Axe.

## Global Constraints

- Preserve both the existing three-scene narrative and the new focused product tour for post-implementation comparison.
- Week demonstrates opening a day preview and marking a current/past session complete.
- Month demonstrates two draft moves—an incomplete past session forward and a future session to the seeded current day—followed by one save.
- Week and Month share one fixed responsive stage; dropdowns and moving items must not affect document layout.
- Every visible Month entry has readable text plus its color marker.
- The seeded current day uses an accent date circle and subtle day-cell/column tint in both views.
- Reduced-motion mode is static and does not auto-cycle.
- Community visuals may be presented as current functionality because Community is enabled in production.
- Historical editing is shown only on a supported per-goal Insights card.
- AI Coach retains a visible `Beta` label and explicit review/apply state.
- Recovery reschedules uncredited sessions; it does not create completions or expose plan history.
- No authenticated API calls, persistence, new dependencies, or new production feature behavior.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before editing.

---

### Task 0: Checkpoint the approved interactive landing baseline

**Files:**
- Existing changes: `src/components/landing/landing-page.tsx`
- Existing changes: `src/components/landing/landing-planner-preview.tsx`
- Existing changes: `src/components/landing/landing-planner-preview.test.tsx`
- Existing changes: `src/components/landing/landing-feature-narrative.tsx`
- Existing changes: `src/components/landing/landing-feature-narrative.test.tsx`
- Existing changes: `src/components/landing/landing-why-goalmaxxing.tsx`
- Existing changes: `src/app/page.tsx`
- Existing changes: `e2e/landing.spec.ts`
- Existing changes: `e2e/app.smoke.spec.ts`
- Existing docs: `docs/landing_page_followups.md`
- Existing docs: `docs/superpowers/specs/2026-08-22-landing-interaction-polish-design.md`
- Existing docs: `docs/superpowers/specs/2026-08-22-landing-hero-story-polish-design.md`
- Existing docs: `docs/superpowers/plans/2026-08-22-landing-interaction-polish.md`
- Existing docs: `docs/superpowers/plans/2026-08-22-landing-hero-story-polish.md`

**Interfaces:**
- Produces: the already-reviewed Week/Month loop, scroll narrative, hero copy, and Why section as a clean baseline commit.

- [ ] **Step 1: Read the repository-version Next.js component guidance**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

Confirm that only animation/browser-observer components retain `"use client"`
and the new static product sections remain Server Components.

- [ ] **Step 2: Run the existing focused tests**

Run:

```bash
pnpm exec vitest run \
  src/components/landing/landing-planner-preview.test.tsx \
  src/components/landing/landing-feature-narrative.test.tsx
```

Expected: both test files pass.

- [ ] **Step 3: Exclude local brainstorming artifacts**

Do not stage `.superpowers/`. It contains local visual-companion state and is not product source.

- [ ] **Step 4: Commit only the approved baseline files**

```bash
git add \
  e2e/app.smoke.spec.ts \
  e2e/landing.spec.ts \
  src/app/page.tsx \
  src/components/landing/landing-page.tsx \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-feature-narrative.tsx \
  src/components/landing/landing-planner-preview.test.tsx \
  src/components/landing/landing-planner-preview.tsx \
  src/components/landing/landing-why-goalmaxxing.tsx \
  docs/landing_page_followups.md \
  docs/superpowers/specs/2026-08-22-landing-interaction-polish-design.md \
  docs/superpowers/specs/2026-08-22-landing-hero-story-polish-design.md \
  docs/superpowers/plans/2026-08-22-landing-interaction-polish.md \
  docs/superpowers/plans/2026-08-22-landing-hero-story-polish.md
git commit -m "feat: polish landing planner and story interactions"
```

Expected: the worktree retains only `.superpowers/` as untracked local state.

---

### Task 1: Rebuild the planner demo around execution and month replanning

**Files:**
- Modify: `src/components/landing/landing-planner-preview.tsx`
- Modify: `src/components/landing/landing-planner-preview.test.tsx`

**Interfaces:**
- Produces: `PlannerDemoPhase`, `nextPlannerDemoPhase`, `monthEntries`, and `SEEDED_TODAY`.
- `LandingPlannerPreview` remains a prop-free Client Component.

- [ ] **Step 1: Replace the phase-sequence test**

Write tests that require the exact loop and static reduced-motion behavior:

```tsx
import { describe, expect, it } from "vitest";
import {
  monthEntries,
  nextPlannerDemoPhase,
  SEEDED_TODAY,
  type PlannerDemoPhase,
} from "@/components/landing/landing-planner-preview";

describe("nextPlannerDemoPhase", () => {
  it("completes a week session, moves two month sessions, and saves once", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "week";

    for (let index = 0; index < 17; index += 1) {
      phase = nextPlannerDemoPhase(phase, false);
      phases.push(phase);
    }

    expect(phases).toEqual([
      "week-preview",
      "week-completing",
      "week-completed",
      "opening-month-menu",
      "selecting-month",
      "month",
      "month-lifting-past",
      "month-moving-past",
      "month-settling-past",
      "month-lifting-future",
      "month-moving-future",
      "month-settling-future",
      "saving",
      "saved",
      "opening-week-menu",
      "selecting-week",
      "week",
    ]);
  });

  it("holds one understandable completed week state with reduced motion", () => {
    expect(nextPlannerDemoPhase("week", true)).toBe("week-completed");
    expect(nextPlannerDemoPhase("week-completed", true)).toBe("week-completed");
  });

  it("gives every month entry text and marks one seeded current day", () => {
    expect(monthEntries.every((entry) => entry.label.trim().length > 0)).toBe(true);
    expect(SEEDED_TODAY).toBe(15);
  });
});
```

- [ ] **Step 2: Run the test and confirm the old model fails**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-planner-preview.test.tsx
```

Expected: FAIL because the new phases and exported month seed model do not exist.

- [ ] **Step 3: Implement the deterministic seed model and phase machine**

Use these exact public types and seed contracts:

```tsx
export type PlannerDemoPhase =
  | "week"
  | "week-preview"
  | "week-completing"
  | "week-completed"
  | "opening-month-menu"
  | "selecting-month"
  | "month"
  | "month-lifting-past"
  | "month-moving-past"
  | "month-settling-past"
  | "month-lifting-future"
  | "month-moving-future"
  | "month-settling-future"
  | "saving"
  | "saved"
  | "opening-week-menu"
  | "selecting-week";

export const SEEDED_TODAY = 15;

export const monthEntries = [
  { id: "focus", day: 4, label: "Deep work", tone: "blue" },
  { id: "tempo", day: 8, label: "Tempo run", tone: "emerald" },
  { id: "plan", day: 12, label: "Plan review", tone: "violet" },
  { id: "launch", day: SEEDED_TODAY, label: "Launch notes", tone: "amber" },
  { id: "strength", day: 18, label: "Strength", tone: "emerald" },
  { id: "review", day: 24, label: "Weekly reset", tone: "blue" },
] as const satisfies ReadonlyArray<{
  id: string;
  day: number;
  label: string;
  tone: TaskTone;
}>;
```

Implement `nextPlannerDemoPhase` from one ordered array. When
`reducedMotion === true`, return `week-completed` for every input.

- [ ] **Step 4: Render Week completion inside the fixed stage**

Use one content layout with a non-changing stage:

```tsx
<CardContent className="grid h-[360px] grid-rows-[minmax(0,1fr)_auto] gap-3">
  <div
    data-demo-calendar-stage
    className="relative min-h-0 overflow-hidden"
  >
    {isMonthView ? <MonthDemo /> : <WeekDemo />}
  </div>
  <StatusRow phase={phase} />
</CardContent>
```

In Week:

- use Thursday the 15th as the seeded current day;
- render the date in a filled blue circle and tint the Thursday column;
- open a compact day preview below the week grid during `week-preview`;
- fill the completion toggle during `week-completing`;
- retain completed styling through `week-completed` and selector phases.

The live status sequence is `Reviewing today` → `Marking Tempo run done` →
`Progress updated`.

- [ ] **Step 5: Render two Month flights without changing layout**

Use one active move selector:

```tsx
type MonthMoveKey = "past" | "future";

function getActiveMonthMove(phase: PlannerDemoPhase): MonthMoveKey | null {
  if (phase.includes("-past")) return "past";
  if (phase.includes("-future")) return "future";
  return null;
}
```

The `past` move sends `Tempo run` from day 8 to day 24. The `future` move sends
`Strength` from day 18 to `SEEDED_TODAY`. Measure the matching source and
destination refs and reuse the existing lifted transform:

```tsx
const flightPosition =
  phase.includes("-lifting")
    ? { x: 0, y: -24, scale: 1.06 }
    : phase.includes("-moving")
      ? { x: flight.deltaX, y: flight.deltaY - 24, scale: 1.06 }
      : { x: flight.deltaX, y: flight.deltaY, scale: 1 };
```

Render source text as a draft ghost after each move and destination text as a
draft addition. Keep the toolbar menu `position: absolute`. Save only after both
moves settle.

- [ ] **Step 6: Stop the reduced-motion timer and preserve visibility gating**

In the phase timer effect, return early when `!isVisible || reducedMotion`.
Derive the displayed phase as `week-completed` when reduced motion is active.
Keep one `IntersectionObserver` and clear every timeout in the effect cleanup.

- [ ] **Step 7: Run the focused test**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-planner-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  src/components/landing/landing-planner-preview.tsx \
  src/components/landing/landing-planner-preview.test.tsx
git commit -m "feat: demonstrate execution and monthly replanning"
```

---

### Task 2: Make the retained narrative scenes product-accurate

**Files:**
- Modify: `src/components/landing/landing-feature-narrative.tsx`
- Modify: `src/components/landing/landing-feature-narrative.test.tsx`

**Interfaces:**
- Produces: exported `featureScenes`, `progressMetrics`, and
  `accountabilityEvents` seed collections.
- Preserves: `selectFeatureIndex(cardCenters, anchor)`.

- [ ] **Step 1: Add failing semantic assertions**

Extend the test:

```tsx
import {
  accountabilityEvents,
  featureScenes,
  progressMetrics,
  selectFeatureIndex,
} from "@/components/landing/landing-feature-narrative";

it("uses shipped progress and accountability concepts", () => {
  expect(progressMetrics.map((metric) => metric.label)).toEqual([
    "Completion rate",
    "Current month activities",
    "Active streak",
  ]);
  expect(accountabilityEvents.map((event) => event.kind)).toEqual([
    "feed",
    "nudge",
  ]);
  expect(featureScenes[2].supportingText).not.toMatch(/request feedback/i);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-feature-narrative.test.tsx
```

Expected: FAIL because the seed collections are not exported and unsupported
copy remains.

- [ ] **Step 3: Replace fictional metrics and chat-like cards**

Use:

```tsx
export const progressMetrics = [
  { label: "Completion rate", value: "82%" },
  { label: "Current month activities", value: "24" },
  { label: "Active streak", value: "7 days" },
] as const;

export const accountabilityEvents = [
  {
    kind: "feed",
    eyebrow: "Community",
    copy: "Alex completed a weekly goal.",
    action: "Cheer",
  },
  {
    kind: "nudge",
    eyebrow: "Duo",
    copy: "Alex sent a momentum nudge.",
    action: "Keep going",
  },
] as const;
```

Keep the existing three titles and scroll behavior. Update the supporting copy
to describe completion trends, heatmap patterns, feed events, partner nudges,
and duo progress. Do not add new event listeners or animation state.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-feature-narrative.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  src/components/landing/landing-feature-narrative.tsx \
  src/components/landing/landing-feature-narrative.test.tsx
git commit -m "refactor: align landing narrative with product metrics"
```

---

### Task 3: Add the focused product tour

**Files:**
- Create: `src/components/landing/landing-product-tour.tsx`
- Create: `src/components/landing/landing-product-tour.test.tsx`

**Interfaces:**
- Produces: prop-free Server Component `LandingProductTour`.
- Contains local leaf visuals for Checklist, Insights/history, Community, and
  personalization.

- [ ] **Step 1: Write the failing content test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingProductTour } from "@/components/landing/landing-product-tour";

describe("LandingProductTour", () => {
  it("shows the real execution, insight, community, and preference workflows", () => {
    render(<LandingProductTour />);

    expect(
      screen.getByRole("heading", { name: "Built for the full loop" })
    ).toBeInTheDocument();
    expect(screen.getByText("Execute your way")).toBeInTheDocument();
    expect(screen.getByText("See your patterns")).toBeInTheDocument();
    expect(screen.getByText("Progress together")).toBeInTheDocument();
    expect(screen.getByText("Make it yours")).toBeInTheDocument();
    expect(screen.getByText("Edit history")).toBeInTheDocument();
    expect(screen.getByText("Season leaderboard")).toBeInTheDocument();
    expect(screen.queryByText(/community chat/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-product-tour.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the section shell and Checklist panel**

Create a semantic section with heading `Built for the full loop` and alternating
two-column panels. The Checklist visual includes:

- `Calendar`, `Checklist`, `Tasks` chips with Checklist active;
- Daily, Weekly, Monthly, and Milestone labels;
- distinct goal rows and a separate `Tasks for this day` footer;
- one animated-looking completed control represented with static styling.

Use only semantic HTML and Tailwind; no client state is required.

- [ ] **Step 4: Implement Insights/history and Community panels**

The Insights visual contains:

- a 5-level heatmap legend;
- a compact SVG 30-day completion-rate line;
- `82% completion`, `7 day streak`, and an `Edit history` state on a recurring
  goal;
- a selected past heatmap day to demonstrate correction.

The Community visual contains:

- one feed event and `Cheer` affordance;
- a three-row `Season leaderboard`;
- a two-person duo summary with a nudge.

Do not use chat bubbles or unsupported reaction types.

- [ ] **Step 5: Implement the personalization strip**

Render one compact strip with avatar, timezone, Monday week start,
`Calendar first`, daily reminder, and social-visibility controls. Keep it
visually subordinate to the three main panels.

- [ ] **Step 6: Run the focused test**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-product-tour.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/components/landing/landing-product-tour.tsx \
  src/components/landing/landing-product-tour.test.tsx
git commit -m "feat: add focused landing product tour"
```

---

### Task 4: Add the experimental bento and compose the complete page

**Files:**
- Create: `src/components/landing/landing-feature-bento.tsx`
- Create: `src/components/landing/landing-feature-bento.test.tsx`
- Modify: `src/components/landing/landing-page.tsx`
- Modify: `src/components/landing/landing-why-goalmaxxing.tsx`

**Interfaces:**
- Produces: prop-free Server Component `LandingFeatureBento`.
- `LandingPage` composes Narrative → Product Tour → Bento → Why.

- [ ] **Step 1: Write the failing bento test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFeatureBento } from "@/components/landing/landing-feature-bento";

describe("LandingFeatureBento", () => {
  it("shows reviewed coach proposals and recovery without overstating behavior", () => {
    render(<LandingFeatureBento />);

    expect(screen.getByText("AI Coach")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Review proposal")).toBeInTheDocument();
    expect(screen.getByText("Recover your rhythm")).toBeInTheDocument();
    expect(screen.getByText("2 sessions re-placed")).toBeInTheDocument();
    expect(screen.queryByText(/autonomous/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm exec vitest run src/components/landing/landing-feature-bento.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the two-card bento**

The larger Coach card shows:

- `AI Coach` and `Beta`;
- user prompt `Help me build a 4-week running routine.`;
- two editable draft/proposal rows;
- `Review proposal` as the visible action state.

The Recovery card shows:

- one past missed session;
- a directional line into a future open date;
- status `2 sessions re-placed`;
- copy explaining that the plan adapts after a disrupted week.

The cards are static marketing visuals with responsive one/two-column layout.

- [ ] **Step 4: Compose the new sections**

Update imports and section order:

```tsx
<LandingFeatureNarrative />
<LandingProductTour />
<LandingFeatureBento />
<LandingWhyGoalmaxxing />
```

Keep the hero, CTA paths, final conversion section, and footer unchanged.

- [ ] **Step 5: Compress Why Goalmaxxing**

Keep `id="why-goalmaxxing"`, headline `Most productivity apps stop at today.`,
the three compact objections, and the concluding positioning line. Reduce card
padding and vertical spacing so the section reads as a concise close rather than
a second feature gallery.

- [ ] **Step 6: Run component tests**

Run:

```bash
pnpm exec vitest run \
  src/components/landing/landing-product-tour.test.tsx \
  src/components/landing/landing-feature-bento.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/components/landing/landing-feature-bento.tsx \
  src/components/landing/landing-feature-bento.test.tsx \
  src/components/landing/landing-page.tsx \
  src/components/landing/landing-why-goalmaxxing.tsx
git commit -m "feat: add landing coach and recovery showcase"
```

---

### Task 5: Extend landing coverage and verify the complete experience

**Files:**
- Modify: `e2e/landing.spec.ts`

**Interfaces:**
- Verifies public landing composition and accessibility.

- [ ] **Step 1: Add product-tour and bento assertions**

Add to the primary landing test:

```tsx
await expect(
  page.getByRole("heading", { name: "Built for the full loop" })
).toBeVisible();
await expect(page.getByText("Execute your way")).toBeVisible();
await expect(page.getByText("See your patterns")).toBeVisible();
await expect(page.getByText("Progress together")).toBeVisible();
await expect(page.getByText("AI Coach")).toBeVisible();
await expect(page.getByText("Recover your rhythm")).toBeVisible();
```

- [ ] **Step 2: Add a fixed-stage layout assertion**

Read the `data-demo-calendar-stage` bounding box in Week, wait until
`data-calendar-view="month"` appears, and assert its height changes by no more
than one CSS pixel:

```tsx
const stage = page.locator("[data-demo-calendar-stage]");
const weekBox = await stage.boundingBox();
await expect(page.locator('[data-calendar-view="month"]')).toBeVisible({
  timeout: 15_000,
});
const monthBox = await stage.boundingBox();
expect(Math.abs((weekBox?.height ?? 0) - (monthBox?.height ?? 0))).toBeLessThanOrEqual(1);
```

- [ ] **Step 3: Run targeted unit tests**

Run:

```bash
pnpm exec vitest run \
  src/components/landing/landing-planner-preview.test.tsx \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-product-tour.test.tsx \
  src/components/landing/landing-feature-bento.test.tsx
```

Expected: four files pass.

- [ ] **Step 4: Run lint diagnostics on touched files**

Run:

```bash
pnpm exec eslint \
  src/components/landing/landing-page.tsx \
  src/components/landing/landing-planner-preview.tsx \
  src/components/landing/landing-planner-preview.test.tsx \
  src/components/landing/landing-feature-narrative.tsx \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-product-tour.tsx \
  src/components/landing/landing-product-tour.test.tsx \
  src/components/landing/landing-feature-bento.tsx \
  src/components/landing/landing-feature-bento.test.tsx \
  src/components/landing/landing-why-goalmaxxing.tsx \
  e2e/landing.spec.ts
```

Expected: zero lint errors.

- [ ] **Step 5: Run the landing Playwright spec**

Run the repository’s configured landing E2E command against the worktree server:

```bash
pnpm exec playwright test e2e/landing.spec.ts --project=chromium
```

Expected: landing content, layout-stage, accessibility, and stale-route tests
pass. If a worktree server is already running, reuse the existing local-only
Playwright config rather than starting a second Next dev process.

- [ ] **Step 6: Perform browser checks**

At desktop and mobile widths, observe one complete visible loop and verify:

- the hero headline and CTA column do not move;
- Week and Month outer stage dimensions remain fixed;
- the seeded current day is visible in both views;
- every Month entry has readable text;
- Week completion and both Month moves occur in order;
- the Month saves once after the second move;
- the narrative sticky visual does not overlap the focused tour;
- the bento and compressed Why section remain readable;
- reduced-motion mode remains static.

- [ ] **Step 7: Commit**

```bash
git add e2e/landing.spec.ts
git commit -m "test: cover expanded landing product story"
```

- [ ] **Step 8: Inspect final diff**

Run:

```bash
git status --short
git diff HEAD~5...HEAD --stat
```

Expected: only intentional `.superpowers/` local artifacts remain untracked and
the six implementation commits contain the approved landing work.
