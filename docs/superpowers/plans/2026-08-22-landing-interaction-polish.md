# Landing Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing narrative scroll in deterministic order and animate a seeded planner task moving from Tuesday to Thursday before saving.

**Architecture:** Keep `src/app/page.tsx` as the Server Component metadata/page boundary and move browser-dependent behavior into two focused Client Components. Use pure exported state helpers for deterministic tests, `motion/react` for the measured floating overlay, and browser visibility APIs only inside the interactive leaf components.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS, Motion 13, Vitest, Testing Library, Playwright.

## Global Constraints

- Hero heading must be exactly `Achieve all your goals from one focused and flexible system.`
- Feature activation must progress 1 → 2 → 3 while scrolling down and reverse while scrolling up.
- Desktop narrative cards and the sticky visual panel must have equal viewport-relative height.
- Task labels must wrap at whole-word boundaries without clipping.
- `Strength` must visibly lift, travel in an arc, settle on Thursday, then show `Saving...` and `Saved`.
- The animation loops only while visible and pauses offscreen.
- Reduced-motion users receive state changes without travel.
- No production persistence, planner mutation APIs, or authenticated drag-and-drop code is used.
- Do not create git commits unless the user separately requests them.

---

### Task 1: Deterministic feature narrative

**Files:**
- Create: `src/components/landing/landing-feature-narrative.tsx`
- Create: `src/components/landing/landing-feature-narrative.test.tsx`
- Modify: `src/components/landing/landing-page.tsx`

**Interfaces:**
- Produces: `selectFeatureIndex(cardCenters: number[], anchor: number): number`
- Produces: `LandingFeatureNarrative(): React.JSX.Element`
- Consumes: static feature scene copy currently embedded in `LandingPage`

- [ ] **Step 1: Write the failing selector and layout test**

```tsx
import { describe, expect, it } from "vitest";
import { selectFeatureIndex } from "@/components/landing/landing-feature-narrative";

describe("selectFeatureIndex", () => {
  it("selects scenes in visual order around one viewport anchor", () => {
    expect(selectFeatureIndex([300, 900, 1500], 320)).toBe(0);
    expect(selectFeatureIndex([-300, 300, 900], 320)).toBe(1);
    expect(selectFeatureIndex([-900, -300, 300], 320)).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing export failure**

Run: `pnpm test src/components/landing/landing-feature-narrative.test.tsx`

Expected: FAIL because `landing-feature-narrative` does not exist.

- [ ] **Step 3: Implement the pure selector and focused Client Component**

```tsx
"use client";

export function selectFeatureIndex(cardCenters: number[], anchor: number) {
  return cardCenters.reduce((best, center, index) => {
    const bestDistance = Math.abs(cardCenters[best] - anchor);
    return Math.abs(center - anchor) < bestDistance ? index : best;
  }, 0);
}
```

Use one passive scroll listener scheduled through `requestAnimationFrame`. Read each narrative card's `getBoundingClientRect().top + height / 2`, compare against `window.innerHeight * 0.45`, and update only when the selected index changes. Render each desktop card with `md:min-h-[60vh]` and the sticky visual with `md:h-[60vh] md:sticky md:top-24`; keep mobile content in normal flow.

- [ ] **Step 4: Render `LandingFeatureNarrative` from `LandingPage` and remove the old observer implementation**

Remove `activeFeatureIndex`, `featureRefs`, and the competing `IntersectionObserver` effect from `landing-page.tsx`.

- [ ] **Step 5: Run the focused test**

Run: `pnpm test src/components/landing/landing-feature-narrative.test.tsx`

Expected: PASS.

---

### Task 2: Animated planner preview

**Files:**
- Create: `src/components/landing/landing-planner-preview.tsx`
- Create: `src/components/landing/landing-planner-preview.test.tsx`
- Modify: `src/components/landing/landing-page.tsx`

**Interfaces:**
- Produces: `PlannerDemoPhase`
- Produces: `nextPlannerDemoPhase(phase: PlannerDemoPhase, reducedMotion: boolean): PlannerDemoPhase`
- Produces: `LandingPlannerPreview(): React.JSX.Element`

- [ ] **Step 1: Write failing phase-sequence tests**

```tsx
import { describe, expect, it } from "vitest";
import {
  nextPlannerDemoPhase,
  type PlannerDemoPhase,
} from "@/components/landing/landing-planner-preview";

describe("nextPlannerDemoPhase", () => {
  it("runs the visible lifted-arc sequence before saving", () => {
    const phases: PlannerDemoPhase[] = [];
    let phase: PlannerDemoPhase = "editing";
    for (let index = 0; index < 6; index += 1) {
      phase = nextPlannerDemoPhase(phase, false);
      phases.push(phase);
    }
    expect(phases).toEqual([
      "lifting",
      "moving",
      "settling",
      "saving",
      "saved",
      "editing",
    ]);
  });

  it("skips travel when reduced motion is requested", () => {
    expect(nextPlannerDemoPhase("editing", true)).toBe("saving");
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing export failure**

Run: `pnpm test src/components/landing/landing-planner-preview.test.tsx`

Expected: FAIL because `landing-planner-preview` does not exist.

- [ ] **Step 3: Implement the phase model and short seeded labels**

```tsx
export type PlannerDemoPhase =
  | "editing"
  | "lifting"
  | "moving"
  | "settling"
  | "saving"
  | "saved";

const phaseOrder: PlannerDemoPhase[] = [
  "editing",
  "lifting",
  "moving",
  "settling",
  "saving",
  "saved",
];

export function nextPlannerDemoPhase(
  phase: PlannerDemoPhase,
  reducedMotion: boolean
) {
  if (reducedMotion && phase === "editing") return "saving";
  if (reducedMotion && phase === "saving") return "saved";
  if (reducedMotion && phase === "saved") return "editing";
  return phaseOrder[(phaseOrder.indexOf(phase) + 1) % phaseOrder.length];
}
```

Seed labels as `Focus`, `Goal review`, `Strength`, `Roadmap`, `Tempo run`, `Launch copy`, `Update`, and `Weekly review`. Apply `whitespace-normal break-normal [overflow-wrap:normal]` and enough vertical padding for whole-word wrapping.

- [ ] **Step 4: Implement visibility-controlled timing**

Use an `IntersectionObserver` on the preview root solely to set `isVisible`. Schedule one timeout per phase only when visible, clear it on phase/visibility change, and keep the current phase when paused. Use `useReducedMotion()` from `motion/react`.

- [ ] **Step 5: Implement measured lifted-arc overlay**

Keep refs for the Tuesday source tile, Thursday destination slot, and calendar container. On travel phases, calculate source/destination rectangles relative to the container. Render one `motion.div` with the same dimensions and label as the source:

```tsx
<motion.div
  data-moving-task="strength"
  className="pointer-events-none absolute z-20 ..."
  animate={{
    x: [0, deltaX * 0.5, deltaX],
    y: [0, Math.min(-32, deltaY - 32), deltaY],
    scale: [1, 1.06, 1],
  }}
  transition={{ duration: 1.05, times: [0, 0.45, 1], ease: "easeInOut" }}
/>
```

Hide the real source during `lifting`, `moving`, and `settling`; render the real destination from `settling` onward. Drive the status badge from phase: editing/travel = `Editing`, saving = `Saving...`, saved = `Saved`.

- [ ] **Step 6: Render `LandingPlannerPreview` from `LandingPage` and remove snapshot swapping**

Delete `WeekSnapshot`, `weekSnapshots`, `activeWeekSnapshotIndex`, and the global interval from `landing-page.tsx`.

- [ ] **Step 7: Run focused tests**

Run: `pnpm test src/components/landing/landing-planner-preview.test.tsx`

Expected: PASS.

---

### Task 3: Copy, integration, and regression coverage

**Files:**
- Modify: `src/components/landing/landing-page.tsx`
- Modify: `e2e/landing.spec.ts`
- Modify: `e2e/app.smoke.spec.ts`

**Interfaces:**
- Consumes: `LandingPlannerPreview`
- Consumes: `LandingFeatureNarrative`

- [ ] **Step 1: Update the E2E heading assertions first**

```tsx
await expect(
  page.getByRole("heading", {
    name: /achieve all your goals from one focused and flexible system/i,
  })
).toBeVisible();
```

- [ ] **Step 2: Run the landing E2E test and confirm the copy failure**

Run: `PLAYWRIGHT_PORT=3312 NEXT_PUBLIC_APP_URL=http://localhost:3312 pnpm playwright test --project=chromium --no-deps e2e/landing.spec.ts`

Expected: FAIL because the old heading is still rendered.

- [ ] **Step 3: Update the hero heading and compose the two extracted components**

Keep the static header, hero copy, CTA, final CTA, and footer in `LandingPage`. Replace the old inline planner card and narrative section with:

```tsx
<LandingPlannerPreview />
<LandingFeatureNarrative />
```

- [ ] **Step 4: Run unit, lint, and landing E2E checks**

Run:

```bash
pnpm test \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-planner-preview.test.tsx
pnpm exec eslint \
  src/components/landing/landing-page.tsx \
  src/components/landing/landing-feature-narrative.tsx \
  src/components/landing/landing-feature-narrative.test.tsx \
  src/components/landing/landing-planner-preview.tsx \
  src/components/landing/landing-planner-preview.test.tsx \
  e2e/landing.spec.ts \
  e2e/app.smoke.spec.ts
PLAYWRIGHT_PORT=3312 NEXT_PUBLIC_APP_URL=http://localhost:3312 \
  pnpm playwright test --project=chromium --no-deps e2e/landing.spec.ts
```

Expected: all checks PASS. If local E2E setup is blocked by the known seeded-auth redirect timing issue, run only the public `marketing landing` suite with `--no-deps` and report the unrelated setup blocker explicitly.

- [ ] **Step 5: Inspect the live worktree server**

Open `http://127.0.0.1:3320`, verify the feature narrative activates 1 → 2 → 3, confirm the third visual stays active to the section bottom, and confirm `Strength` visibly arcs from Tuesday to Thursday before saving.
