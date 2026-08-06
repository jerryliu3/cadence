# Planner Goal Schema Simplification Decision

Status: Recommended  
Last updated: 2026-08-06  
Owners: Planner platform

## Why this exists

The planner currently uses three requirement kinds:

- `milestone_sequence`
- `cadence`
- `deadline_total`

This is correct for scheduling and reconciliation, but the user-facing model is harder to explain than it needs to be. This document maps where each kind actually differs, then proposes a migration-aware simplification path that keeps kernel correctness intact.

## Current behavior matrix (code-level reality)

### `milestone_sequence`

- **Origin**: fixed-milestone goals in `getGoalRequirement()` (`src/lib/planner/requirements.ts`).
- **Placement shape**: one unit per milestone ordinal with lifetime credit window (`src/lib/planner/work-units.ts`).
- **Miss policy**: `roll_forward`.
- **Credit assignment**: strictly chronological fact-to-unit assignment (`src/lib/planner/reconciliation.ts`).
- **User mental model**: ordered named milestones.
- **Completion route default**: legacy period route outside active planner membership, planner item/goal exact-date routes in active planner contexts (`src/lib/planner/completion-dispatch.ts`).

### `cadence`

- **Origin**: recurring goals without target totals in `getGoalRequirement()` (`src/lib/planner/requirements.ts`).
- **Placement shape**: anchored period buckets (`src/lib/planner/work-units.ts`).
- **Miss policy**: `remain_missed`.
- **Credit assignment**: any admissible completion in the period credit window fulfills the unit (`src/lib/planner/reconciliation.ts`).
- **Off-schedule semantics**: remains `fulfilled`; only `creditState` reflects drift (`completed_elsewhere`).
- **User mental model**: period-based consistency and streaks.

### `deadline_total`

- **Origin**: recurring goals with `target_count > 0` in `getGoalRequirement()` (`src/lib/planner/requirements.ts`).
- **Placement shape**: ordinal total units (`total:1..N`) with lifetime credit window (`src/lib/planner/work-units.ts`).
- **Miss policy**: `roll_forward`.
- **Credit assignment**: scheduled-date-first, then chronological fallback (`src/lib/planner/reconciliation.ts`).
- **Off-schedule semantics**: can become `satisfied_elsewhere` when a scheduled item is fulfilled on another date.
- **User mental model**: exact-date completions toward a deadline total.

## Complexity drivers

- The two count-based kinds (`milestone_sequence`, `deadline_total`) look similar in UI but differ materially in reconciliation policy.
- The cadence kind shares some UI controls with count-based goals while having different credit semantics.
- Completion behavior differs by active planner membership and item matching state, which is correct but hard to explain in product copy.

## Options considered

### Option A (recommended): Simplify UX copy and controls without backend schema change

- Keep the three planner requirement kinds internally.
- Expose two top-level user decisions in goal setup/edit:
  - **How progress is measured**: period consistency vs total completions.
  - **Whether total milestones are named**: optional milestone labels for total-completion goals.
- Hide internal requirement-kind terminology from end users.

Pros:

- Lowest migration risk.
- Preserves all existing kernel and reconciliation invariants.
- Can ship incrementally with no SQL schema migration.

Cons:

- Internal complexity remains in planner code.

### Option B (follow-up, medium risk): Add a planner-facing abstraction layer

- Introduce a derived planner mode (`period_consistency` vs `total_completions`) that maps to current kinds.
- Keep existing persistence fields and requirement fingerprint behavior unchanged.
- Use this abstraction only for product copy and UI logic.

Pros:

- Better internal readability for product-facing logic.
- No data migration required.

Cons:

- Additional mapping layer to maintain.

### Option C (defer): Full consolidation of requirement kinds

- Collapse `milestone_sequence` and `deadline_total` into a single count schema with optional ordered labels.
- Potentially collapse goal frequency typing and planner requirement typing.

Pros:

- Conceptually cleaner long-term model.

Cons:

- Highest blast radius: `requirements`, `work-units`, `reconciliation`, kernel fingerprints, goal CRUD, telemetry, and regression fixtures.
- High risk of semantic regression unless staged over multiple releases.

## Recommendation

Adopt Option A now, optionally followed by Option B. Defer Option C until there is evidence that internal maintenance cost justifies a broad migration.

Reasoning:

- Current behavior differences are real and user-visible when replaying historical facts and handling scheduled-date drift.
- The biggest immediate win is reducing user-facing terminology complexity, not changing kernel semantics.

## Migration-aware plan if consolidation is later pursued

If Option C is revisited, use a staged plan:

1. **Compatibility stage**
   - Add a new derived planner requirement field in contracts as additive metadata.
   - Keep old fields and current fingerprint source unchanged.

2. **Dual-read stage**
   - Planner consumes new derived field when present, falls back to old mapping otherwise.
   - Keep all old write paths intact.

3. **Dual-write stage**
   - Goal writes populate both old and new shape.
   - Add telemetry for mismatch detections between old/new derivation.

4. **Cutover stage**
   - Switch read preference fully to new shape.
   - Keep old data for historical replay compatibility until retention threshold.

5. **Cleanup stage**
   - Remove old shape only after drift, replay, and contract fixtures show zero regressions over soak window.

## No-regression criteria (must hold)

- `cadence` off-schedule completions remain `fulfilled` with `completed_elsewhere` credit state.
- `deadline_total` retains scheduled-date-first reconciliation before chronological fallback.
- `milestone_sequence` remains purely chronological in milestone order.
- Completion dispatch fixture routes stay stable for Today/Insights/Calendar bridge cases.
- Requirement fingerprints remain stable for semantically unchanged goals.
- Planner drift typing (`inadmissible`, `out_of_plan`, `credited_work_removed`, `credited_work_reassigned`) is unchanged for existing fixture scenarios.

## Validation checklist for any follow-up implementation

- `pnpm vitest run src/lib/planner/requirements.test.ts src/lib/planner/work-units.test.ts src/lib/planner/completion-dispatch.test.ts`
- `pnpm typecheck`
- `pnpm eslint` on changed planner goal + surface files
- Contract fixture checks if requirement serialization changes

