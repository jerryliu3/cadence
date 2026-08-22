# Landing Hero and Story Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hero planner visually dominant, add a continuous Week/Month demonstration, compact the feature narrative, and add the Why Goalmaxxing story section.

**Architecture:** Extend the existing isolated landing components rather than importing authenticated planner code. Keep one explicit demo phase state machine in `LandingPlannerPreview`, static story content in a focused component, and hero composition in `LandingPage`.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS, Motion 13, Vitest, Playwright.

## Global Constraints

- Desktop hero ratio is one-third copy and two-thirds planner.
- Hero heading is exactly `Achieve your goals using one focused system.`
- Supporting copy is exactly `Plan beyond daily habits. Connect today's actions to the weeks and months ahead.`
- `Read story` links to `#why-goalmaxxing`.
- The demo automatically cycles Week movement/save → Month selection/view → Week selection/view.
- Dropdown selection is demonstrative, not an interactive form control.
- Feature panels use equal `clamp(280px, 38vh, 360px)` desktop heights.
- The story uses the approved Why Goalmaxxing problem-first content.
- Reduced motion skips travel/dropdown movement while preserving Week/Month states.
- Do not create git commits unless separately requested.

---

### Task 1: Unified Week/Month planner loop

**Files:**
- Modify: `src/components/landing/landing-planner-preview.test.tsx`
- Modify: `src/components/landing/landing-planner-preview.tsx`

**Interfaces:**
- Extend `PlannerDemoPhase` with `opening-month-menu`, `selecting-month`, `month`, `opening-week-menu`, and `selecting-week`.
- Keep `nextPlannerDemoPhase(phase, reducedMotion)` as the canonical transition function.

- [ ] **Step 1: Extend the phase tests first**

Assert the normal sequence:

```tsx
expect(phases).toEqual([
  "lifting",
  "moving",
  "settling",
  "saving",
  "saved",
  "opening-month-menu",
  "selecting-month",
  "month",
  "opening-week-menu",
  "selecting-week",
  "editing",
]);
```

Assert reduced motion follows:

```tsx
expect(reducedPhases).toEqual([
  "saving",
  "saved",
  "month",
  "editing",
]);
```

- [ ] **Step 2: Run the focused test and confirm it fails on the old sequence**

Run: `pnpm test src/components/landing/landing-planner-preview.test.tsx`

Expected: FAIL because the Week/Month phases do not exist.

- [ ] **Step 3: Extend the phase state machine and timing table**

Add the five view phases. For reduced motion, transition `saved → month → editing`. Use short menu open/select timings and a longer month hold.

- [ ] **Step 4: Add the compact view selector**

Render a visual trigger labelled `Week` or `Month`. During opening phases, show a two-option menu. During selection phases, highlight the destination option, then swap calendar views. Keep this visual control `aria-hidden`; expose a separate concise `aria-live` status.

- [ ] **Step 5: Add a seeded month grid**

Render weekday headings plus 35 date cells. Use compact activity dots and at most a few short labels. Preserve the weekly arc animation unchanged.

- [ ] **Step 6: Remove redundant planner copy**

Remove the secondary header subtitle and replace the bottom two-line panel with one compact status line.

- [ ] **Step 7: Run planner tests**

Run: `pnpm test src/components/landing/landing-planner-preview.test.tsx`

Expected: PASS.

---

### Task 2: Hero and story content

**Files:**
- Create: `src/components/landing/landing-why-goalmaxxing.tsx`
- Modify: `src/components/landing/landing-page.tsx`
- Modify: `e2e/landing.spec.ts`
- Modify: `e2e/app.smoke.spec.ts`

**Interfaces:**
- Produce `LandingWhyGoalmaxxing(): React.JSX.Element`.
- Preserve `LandingPlannerPreview` and `LandingFeatureNarrative` composition.

- [ ] **Step 1: Update E2E assertions first**

Assert the new heading, `Read story` href, and story heading:

```tsx
await expect(
  page.getByRole("heading", {
    name: /achieve your goals using one focused system/i,
  })
).toBeVisible();
await expect(page.getByRole("link", { name: "Read story" })).toHaveAttribute(
  "href",
  "#why-goalmaxxing"
);
await expect(
  page.getByRole("heading", { name: "Most productivity apps stop at today." })
).toBeVisible();
```

- [ ] **Step 2: Run the public landing test and confirm the copy/story failure**

Run the landing Playwright suite against the worktree server.

Expected: FAIL because the old heading and no story section are rendered.

- [ ] **Step 3: Implement the hero ratio and concise copy**

Use `md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`. Replace heading/supporting copy exactly. Add an outline `Read story` link beside `Go to app`.

- [ ] **Step 4: Add the Why Goalmaxxing section**

Render the approved heading, concise lead, three frustration cards, and closing statement under `id="why-goalmaxxing"`. Place it after `LandingFeatureNarrative` and before the final CTA.

- [ ] **Step 5: Run the public landing test**

Expected: PASS.

---

### Task 3: Compact narrative and final verification

**Files:**
- Modify: `src/components/landing/landing-feature-narrative.tsx`
- Verify all files changed in Tasks 1–2.

- [ ] **Step 1: Compact equal-height panels**

Replace desktop `60vh` heights with `h-[clamp(280px,38vh,360px)]` for both columns. Reduce card padding/spacing where needed while preserving content and deterministic activation.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
pnpm test \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-planner-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run static checks**

Run changed-file ESLint and `pnpm typecheck`.

Expected: PASS.

- [ ] **Step 4: Run public landing E2E and accessibility coverage**

Run `e2e/landing.spec.ts` against the worktree server.

Expected: all three marketing landing tests PASS.

- [ ] **Step 5: Browser-check the continuous demo**

Verify the live phase sequence reaches a visible Month view and returns to Week, `Read story` scrolls to the story section, and narrative scenes remain ordered with compact equal heights.
