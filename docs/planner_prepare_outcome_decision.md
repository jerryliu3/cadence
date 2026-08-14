# Planner Prepare Outcome Decision Record

Status: Accepted  
Last updated: 2026-08-14  
Owners: Planner platform

## Why this exists

Planner calendar preparation currently performs horizon-wide reconciliation and persistence before the calendar view renders. We need a clear, durable product decision for how to represent and communicate goals that cannot be fully auto-placed under current constraints.

The core decision is whether to model this as:

- a transient warning channel (`prepareWarnings`), or
- a durable, derived planner state that surfaces as part of normal goal status.

This document captures product/UX implications, user resolution paths, recompute behavior, and the chosen architecture direction.

## Current behavior baseline

- Calendar open can trigger `POST /api/planner/prepare`.
- Preparation currently avoids full-calendar failure when one goal cannot fully place, but blocked goals preserve existing placements and do not persist additional newly placed partial sessions for that goal.
- The response may include per-goal `prepareWarnings`.
- The UI currently presents these mainly as transient feedback (toast-level delivery on load).

Related runtime surfaces:

- `src/lib/planner/prepare.ts`
- `src/features/planner/calendar-surface.tsx`
- `src/features/planner/calendar-surface.types.ts`

## Option A: Warning Channel

Superseded by accepted direction; retained for historical tradeoff context.

### User experience

- User opens calendar.
- Sessions that can be placed are persisted.
- A warning message indicates one or more goals could not be fully auto-prepared.
- Message is delivery-based (toast/banner) and can be missed or dismissed.

### What users can do to resolve

- Lower `target_count`.
- Extend `end_date`.
- Relax constraints (rest weekdays, blackout ranges, policy restrictions).
- Manually move remaining sessions if valid slots exist.
- Trigger prepare/recompute again after edits.

### Self-resolution profile

- Can self-resolve on the next prepare call if constraints changed or new capacity exists.
- Does not self-resolve if constraints remain unsatisfiable.
- Messaging must be re-delivered each load to remain visible.

### Strengths

- Lowest immediate implementation cost.
- Minimal schema/API expansion.
- Fast to ship.

### Risks

- Transient UX can be confusing ("something warned me earlier, now where is it?").
- Re-delivery logic is extra machinery.
- Blends expected domain outcomes and system anomalies unless tightly structured.

## Option B: Derived Persistent Prepare State

Superseded by accepted implementation details below; retained for historical tradeoff context.

### User experience

- User opens calendar.
- Sessions that can be placed are persisted.
- Goal-level planner state indicates unresolved capacity/lock outcomes directly in durable planner data, visible across planner surfaces.
- No dependence on warning delivery to preserve meaning.

### What users can do to resolve

Same resolution actions as Option A:

- change target/end date,
- adjust constraints,
- move sessions,
- recompute.

The difference is discoverability and continuity: users can always find unresolved goals later without relying on a past toast.

### Self-resolution profile

- Self-resolves when a recompute/prepare produces a satisfiable schedule.
- Persists while unresolved, so it does not silently disappear.

### Strengths

- Better long-term structure: "state over message."
- Easier cross-surface consistency (calendar, planner summary, future planner-adjacent UI).
- Better observability and analytics.

### Risks

- Higher upfront modeling effort.
- Requires careful semantics to avoid conflating planner-capacity state with lifecycle completion outcomes.

## Important semantic boundary

Do not overload lifecycle `ended_with_shortfall` for planner-capacity signaling.

- Lifecycle shortfall is a completion/outcome concept (goal ended, insufficient credited completions).
- Prepare underplanning is a planning-capacity concept (cannot currently place all required sessions in horizon).

These should remain distinct to avoid user confusion and incorrect status propagation.

## Product/UX difference summary

- Warning model is event-like and ephemeral; users may miss context.
- Derived-state model is durable and inspectable; users can return later and still understand what needs action.
- Both models require similar remediation actions.
- Derived-state model is better for long-term trust and cross-surface coherence.

## Recompute decision framework

### Definition

Recompute means: rerun preparation against latest goals, policy, constraints, and persisted assignments, then persist reconciled output.

### Should we add a recompute button?

Yes. Recommended in the accepted model:

- Keep implicit recompute on relevant edits (goal/policy changes).
- Add explicit `Rebuild schedule` in planner overflow menu (not in infeasibility CTA row).

This serves the accepted durable-state model by providing a user-controlled reconcile path without conflating it with infeasibility remediation actions.

### What recompute solves

- Re-evaluates unplaceable goals after constraints change.
- Reconciles stale/missing identities in horizon.
- Can clear durable unplaceability state when capacity becomes feasible.

### What recompute does not solve

- Inherently impossible constraints (for example, target exceeds feasible slots with fixed rest/blackouts and deadline) without user edits.

## Chosen direction

Use the durable derived planner-state model now (not a phased near-term/long-term split), while preserving partial prepare so one bad goal never blocks calendar load.

### Required implementation guardrails

1. Keep partial prepare as a hard invariant:
   - one unplaceable goal must never blank calendar load.
2. Persist durable unplaceability inside the same write boundary:
   - write per-goal unplaceability records in `prepare_planner_schedule` transaction (same owner lock + digest boundary as schedule reconciliation).
   - enforce owner-only RLS on the durable record table.
   - keep write path in security-definer RPC with `search_path=''` and explicit ownership checks.
   - upsert record when unresolved units remain, and delete any existing record when goal resolves fully (same transaction as schedule reconciliation).
   - keep `goal_id` FK as `references goals(id) on delete cascade`.
   - use a lean record shape keyed by `(owner_id, goal_id)` with:
     - `requirement_fingerprint`,
     - `policy_revision`,
     - `lock_signature` (deterministic hash of current goal lock state in horizon),
     - `effective_span_end` (goal-level solved end, not global horizon end),
     - `unplaced_count`,
     - `reason` (`capacity` or `invalid_lock`),
     - `computed_at`.
3. Use three-way solver outcome handling per goal:
   - `placement_shortfall`: continue, persist placed units, record `reason=capacity` + `unplaced_count`.
   - `invalid_lock`: do not mutate that goal's persisted schedule, record `reason=invalid_lock` + `unplaced_count`.
   - invariant violations (including duplicate same-goal same-day): throw and `reportError`.
4. Replace warning-channel semantics with convergent reconcile algebra:
   - remove `prepareWarnings` as user-facing state.
   - `goalNeedsPreparation` must be symmetric and convergent:
     - missing direction (required not covered by persisted + accounted),
     - stale direction (persisted no longer required).
   - accounted term comes from a valid unplaceability record and must represent the full unresolved gap for both `capacity` and `invalid_lock` reasons, so unchanged infeasible/lock-blocked goals skip repeated full solves.
5. Record validity is hash-based, not trigger-list-based:
   - record is usable only when fingerprint, policy revision, and lock signature match current inputs, and `record.effective_span_end >= currentEffectiveEnd`.
   - failed validity means "ignore record and re-solve", with no manual invalidation path.
6. Keep windows goal-scoped and bounded by existing 366-day contract:
   - retain current bounded month chunking for long lifetimes.
   - keep existing `MAX_PLANNER_WINDOW_DAYS` constant and add boundary rationale comment (no second constant name).
7. Accept bounded temporal staleness explicitly:
   - as `asOfDate` advances, unresolved counts can understate until next edit/recompute.
   - do not force daily global re-solves solely to refresh this number.
8. Keep explicit recompute control in planner UI:
   - label "Rebuild schedule" in overflow menu.
   - keep implicit recompute on relevant edits.
9. Add write-time feasibility warning (warning-only):
   - in goal form validation, count available days from `max(startDate, asOfDate)`.
   - compare against target count with hedged user copy ("likely won't fit") when exact progress context is unavailable.
10. Keep lifecycle semantics separate:
    - do not map planner capacity state onto lifecycle `ended_with_shortfall`.

## Concrete rollout sequence

1. Add durable table + RPC write integration:
   - persist per-goal unplaceability records in `prepare_planner_schedule` transaction with schedule changes.
   - upsert on unresolved, delete on fully resolved, and rely on goal FK cascade for hard deletes.
2. Implement three-way prepare branch:
   - partial persist for capacity shortfall,
   - no-write + recorded reason for invalid lock,
   - throw/report for invariants.
   - match issue codes by membership, not strict array equality.
   - compute `unplaced_count` as the full unresolved gap in both shortfall and invalid-lock branches.
3. Implement symmetric convergent precheck:
   - gate solve/reconcile from required vs persisted plus accounted missing units.
4. Remove warning channel end-to-end:
   - delete `prepareWarnings` payload plumbing and toast path.
5. Expose durable state through one selector:
   - shared selector powers both calendar banner and goal-level badge to avoid drift.
6. Add focused planner UX:
   - non-dismissible one-line banner with route to edits,
   - use explicit global-policy CTA wording: `Change rest days for all goals`.
   - keep `Rebuild schedule` in overflow, not in infeasibility CTA row.
7. Add write-time feasibility warning:
   - goal-form warning-only validation for likely infeasible target/capacity combinations.
8. Add/adjust tests:
   - durable record validity cases,
   - convergent precheck behavior,
   - partial persist under shortfall,
   - invalid lock handling,
   - invariant throw path,
   - selector/banner consistency.

## Decision

- Choose the derived persistent planner prepare state model as primary UX now.
- Keep partial prepare as a hard product invariant.
- Keep explicit recompute + implicit recompute triggers.
- Keep invariant failures out of user-facing warning taxonomy.
- Keep the implementation lean: count-based durable record, one shared selector, no collapse-state machinery.

## Validation checklist

- Calendar open remains resilient when one goal is unplaceable.
- Displayed persisted sessions remain movable under existing move rules.
- Recompute can resolve underplanning after user edits.
- Invariant failures are not silently treated as normal user warnings.
- Deterministic behavior is preserved under 366-day write-boundary constraints.
- Unchanged infeasible goal triggers no solve on a second calendar open (convergence).
- Editing `end_date` invalidates durable record validity and re-solves.
- Requirement shrink deletes now-unrequired persisted units (stale-direction reconcile).
- Horizon growth from 12 to 24 months does not invalidate goals whose `end_date` remains inside 12 months.
- `placement_shortfall` persists placed units and records exact `unplaced_count` for unresolved units.
- `invalid_lock` performs no schedule mutation for that goal and records `reason=invalid_lock`.
- `invalid_lock` goals also converge (no full re-solve on unchanged second calendar open).
- Lock/unlock transitions invalidate stale `invalid_lock` records through lock-signature mismatch and force a fresh solve.
- When a goal becomes feasible, its durable record is deleted; reverting to a previously infeasible definition re-solves and does not reuse stale count.
- Calendar banner count equals shared selector output, and no banner renders when no valid durable record exists.

Suggested verification:

- `pnpm vitest run src/lib/planner/prepare.test.ts src/app/api/planner/prepare/route.test.ts src/features/planner/calendar-surface.characterization.test.tsx`
- `pnpm vitest run src/lib/goals/definition-validation.test.ts`
- `pnpm vitest run supabase/tests/database/planner_prepare_boundary.test.sql` (or equivalent DB test coverage including durable record write + RLS)
- `pnpm typecheck`
- `pnpm lint`
