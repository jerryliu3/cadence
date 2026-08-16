# Insights Overlay Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate overlay-induced horizontal movement and compact the Insights Goal Stats controls and goal headers.

**Architecture:** Keep Radix modal semantics while leaving root scrollbar geometry visible and stable during body locking. Make the Goal Stats filter sheet controlled by `InsightsTab`, which places its icon trigger beside the period stepper while the filter component renders compact quick pills and the sheet. Extract the repeated per-goal heading layout into a small presentational component so inline metadata is independently testable.

**Tech Stack:** React 19, Next.js 16, Radix UI, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Preserve modal focus trapping, background accessibility hiding, and scroll-event blocking.
- Use `h-8`, content-width, shaded pills matching Checklist quick filters.
- Keep all existing filter behavior and goal-edit behavior unchanged.
- Do not add dependencies.

---

### Task 1: Stabilize all overlay geometry

**Files:**
- Modify: `src/lib/ui/overlay-scroll-lock.test.ts`
- Modify: `src/app/globals.css`
- Test: `src/components/ui/dialog.test.tsx`

**Interfaces:**
- Consumes: Radix `body[data-scroll-locked]` and existing root `overflow-y: scroll`.
- Produces: unchanged root scrollbar geometry while Radix continues preventing scroll events.

- [ ] **Step 1: Strengthen the failing CSS regression**

Update the assertion to require the locked body to keep overflow visible:

```ts
expect(globalsCss).toMatch(
  /html body\[data-scroll-locked\]\s*\{[^}]*overflow:\s*visible\s*!important;[^}]*margin-right:\s*0\s*!important;[^}]*padding-right:\s*0\s*!important;[^}]*--removed-body-scroll-bar-size:\s*0px\s*!important;[^}]*\}/s
);
```

- [ ] **Step 2: Run the regression and verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/ui/overlay-scroll-lock.test.ts
```

Expected: FAIL because the current rule does not override Radix’s injected `overflow: hidden !important`.

- [ ] **Step 3: Preserve scrollbar geometry**

Update the locked-body rule:

```css
html body[data-scroll-locked] {
  overflow: visible !important;
  margin-right: 0 !important;
  padding-right: 0 !important;
  --removed-body-scroll-bar-size: 0px !important;
}
```

Retain the existing comment, explaining that `react-remove-scroll` still blocks wheel/touch events and focus while the root scrollbar track remains stable.

- [ ] **Step 4: Verify overlay tests**

Run:

```bash
pnpm exec vitest run src/lib/ui/overlay-scroll-lock.test.ts src/components/ui/dialog.test.tsx
```

Expected: both test files pass.

### Task 2: Compact Goal Stats filter controls

**Files:**
- Modify: `src/features/insights/insights-goal-stats-filters.test.tsx`
- Modify: `src/features/insights/insights-goal-stats-filters.tsx`
- Modify: `src/features/insights/insights-tab.tsx`

**Interfaces:**
- `InsightsGoalStatsFilters` consumes `open: boolean` and `onOpenChange(open: boolean): void`.
- `InsightsTab` owns `goalStatsFiltersOpen` and renders the icon-only trigger beside `InsightsPeriodStepper`.

- [ ] **Step 1: Write failing compact-control assertions**

Change the component test to pass controlled `open` state, verify there is no text “Filters” button in the quick row, and require the quick controls container and pills to use Checklist sizing:

```tsx
expect(screen.getByTestId("insights-quick-filters")).toHaveClass(
  "flex",
  "overflow-x-auto"
);
expect(screen.getByRole("button", { name: "Next month" })).toHaveClass(
  "h-8",
  "shrink-0",
  "rounded-full"
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run src/features/insights/insights-goal-stats-filters.test.tsx
```

Expected: FAIL because the current component renders a six-column grid and a text Filters button.

- [ ] **Step 3: Make the filter sheet controlled and compact**

Add:

```ts
open: boolean;
onOpenChange: (open: boolean) => void;
```

Remove local open state and the filter trigger. Render the quick actions as:

```tsx
<div
  data-testid="insights-quick-filters"
  className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1"
>
```

Give every quick action:

```tsx
className="h-8 shrink-0 rounded-full px-3 text-xs"
```

Use `<Dialog open={open} onOpenChange={onOpenChange}>`.

- [ ] **Step 4: Place the icon beside the period stepper**

In `InsightsTab`, add `goalStatsFiltersOpen` state. Change the centered header control to a flex row containing the existing stepper and:

```tsx
<Button
  type="button"
  variant="outline"
  size="icon-sm"
  className="h-8 w-8 shrink-0 rounded-full"
  aria-label="Open Insights filters"
  title="Open Insights filters"
  onClick={() => setGoalStatsFiltersOpen(true)}
>
  <SlidersHorizontal className="size-3.5" />
</Button>
```

Pass `open` and `onOpenChange` to `InsightsGoalStatsFilters`.

- [ ] **Step 5: Verify compact controls**

Run:

```bash
pnpm exec vitest run src/features/insights/insights-goal-stats-filters.test.tsx
```

Expected: PASS.

### Task 3: Put goal badges inline with the title

**Files:**
- Create: `src/features/insights/insights-goal-card-header.tsx`
- Create: `src/features/insights/insights-goal-card-header.test.tsx`
- Modify: `src/features/insights/insights-tab.tsx`

**Interfaces:**
- `InsightsGoalCardHeader` consumes `title`, `color`, `categoryLabel`, `categoryClassName`, `endDate`, and optional `action: ReactNode`.
- Produces one wrapping top row containing title metadata and action.

- [ ] **Step 1: Write the failing header component test**

Create a test that renders an Edit button as `action` and asserts the title, category, deadline, and Edit action all share the same `data-testid="insights-goal-card-header"` container.

- [ ] **Step 2: Run the test and verify the missing component fails**

Run:

```bash
pnpm exec vitest run src/features/insights/insights-goal-card-header.test.tsx
```

Expected: FAIL until the presentational component exists.

- [ ] **Step 3: Implement the single-row header**

Render:

```tsx
<div
  data-testid="insights-goal-card-header"
  className="flex flex-wrap items-start justify-between gap-2"
>
  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    <p className="text-sm font-semibold leading-tight break-words [overflow-wrap:anywhere]">
      {title}
    </p>
    <Badge variant="outline" className={categoryClassName}>
      {categoryLabel}
    </Badge>
    <GoalEndMonthBadge endDate={endDate} />
  </div>
  {action}
</div>
```

- [ ] **Step 4: Replace the old two-row markup**

Use `InsightsGoalCardHeader` from `InsightsTab`, pass the existing Edit/Done button as `action`, and delete the dedicated category/deadline row.

- [ ] **Step 5: Verify header and existing Insights tests**

Run:

```bash
pnpm exec vitest run src/features/insights/insights-goal-card-header.test.tsx src/features/insights/insights-goal-stats-filters.test.tsx
```

Expected: both pass.

### Task 4: Final verification

**Files:**
- Verify all files changed by Tasks 1–3.

- [ ] **Step 1: Run focused tests**

```bash
pnpm exec vitest run src/lib/ui/overlay-scroll-lock.test.ts src/components/ui/dialog.test.tsx src/features/insights/insights-goal-card-header.test.tsx src/features/insights/insights-goal-stats-filters.test.tsx
```

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 3: Review the final diff**

Confirm that filter semantics, edit callbacks, modal behavior, and unrelated untracked files are unchanged.
