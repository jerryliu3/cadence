# Planner Cross-Month Correctness + XP/Rewards (V2)

> **Currency note (2026-08-10):** Planning doc — parts may lag the main tree. Prefer migrations, `AGENTS.md`, and current API routes as source of truth before implementing from this plan.

## Context

Two independent workstreams:

- **A (Planner):** correctness and consistency fix.
- **B (XP/Rewards):** additive feature work.

Planner correctness should ship and stabilize before broader XP/rewards rollout.

This V2 plan incorporates lessons from deeper implementation and review, including what is already implemented in isolated worktrees and what should be next.

## What Changed from V1

1. **Root-cause diagnosis remains the same** for planner inflation, but boundary merge hardening is still kept as a defensive layer.
2. **Horizon-wide publish** is moved to a hardening phase (important, but not required to ship first correctness improvements).
3. **XP architecture starts trigger-first** (single canonical integration point on `public.completions`) instead of recompute-and-diff as first ship.
4. **Level thresholds stay table-driven** (`xp_levels`) for runtime tuning without redeploys.

## Locked Product Decisions

1. Cross-month correctness first, inside current month-by-month UI.
2. `target_count` remains authoritative for ordinal goals; recurrence interval remains a spacing hint.
3. Cascaded completions award reduced XP, default 25%.
4. XP and awards are fully reversible when completion facts are removed.
5. Goal-level custom reward text is supported.
6. Keep schema complexity low: prefer logic and test fixes inside existing tables/functions before introducing new persistence surfaces.

## Updated Priorities (Worth Acting Now vs Follow-Ups)

### Must Act Now (before merge)

1. **A - Carry-forward for elapsed ordinal months:** uncredited ordinal units from elapsed months must remain schedulable in current/future months (no stranding).
2. **A - Capacity-aware spill-forward:** carry-forward must respect policy capacity and spill into later months with slack so shortfall is honest, not artificial.
3. **B - XP must follow credited progress semantics:** only admissible credited completions should award XP (no out-of-window, future-dated, over-target, or same-period over-credit farming).
4. **B - Achievement XP lifecycle consistency:** goal updates/deletes must re-evaluate and reverse/reapply achievement XP as needed.

### Follow-Ups (planned, non-blocking for this remediation pass)

- Planner rollout kill switch and additional staleness hardening.
- Cross-plan invariant hardening and horizon-wide publish atomicity.
- Coach horizon context and compact horizon UI counters.
- Reward unlock announcement lifecycle (`newlyUnlocked`, acknowledge, one-time toast).
- XP UI refresh behavior improvements and additional DB tuning safeguards.

---

## Post-PR25 Execution Plan (PR-by-PR)

1. **PR26 - Cross-plan ordinal unit ownership guard (point 1a)**
   - Add DB trigger guard for active cross-month duplicates of `(original_goal_id, unit_key)` for ordinal kinds.
   - Keep this independent from horizon publish RPC refactors.
   - Add SQL tests for same unit key on different dates.
2. **PR27 - Elapsed active-plan lifecycle policy (point 1b)**
   - Add lifecycle behavior so elapsed active month plans no longer compete with current/future publishes.
   - Preferred implementation: supersede elapsed active plans during publish under the existing owner advisory lock.
   - Add publish guard rejecting elapsed `scope_month` in the base (28-arg) publish RPC using owner-timezone month boundary (`private.local_today_for_timezone`) so historical active rows cannot be recreated.
   - Add SQL tests proving September publish is not blocked by stale August active ordinals.
   - **Stage 3 carry-over:** when publish RPC logic is ported to TypeScript, keep this elapsed-scope guard or point-1 regression returns.
3. **PR28 - Eligibility reason surfacing**
   - Type eligibility reasons in planner preview payload and render user-visible reason chips/messages for ineligible goals.
4. **PR29 - Coach horizon framing cleanup**
   - Remove lossy aggregate horizon span framing and rely on per-goal horizon/open-ended markers.
5. **PR30 - Horizon-cap drift contract check**
   - Add generated SQL assertion binding DB constraint behavior to `MAX_HORIZON_MONTHS`.
6. **PR31 - Progress-oracle cross-check fixtures**
   - Add fixture harness comparing goal progress credit counts, planner reconciliation aggregates, and XP credit projection (once active).

### Point 1 Deep Dive (what else is required beyond guard)

Guard-only hardening prevents silent duplication but can still dead-end publishes when elapsed-month plans remain `active` with stale ordinal rows. To fully close point 1, we need one additional behavior layer:

- **Recommended:** lifecycle supersede of elapsed active plans inside publish service (same transaction and owner lock).
- **Fallback:** treat elapsed active plans as non-authoritative in cross-plan guards (smaller change, weaker model).

The recommended path keeps DB invariants explicit and prevents conflicts from stale historical "active" rows without requiring a horizon publish RPC in this phase.

---

## Workstream A - Planner Cross-Month Correctness

### A0. Scope and Non-Goals

**In scope**

- Fix inflated ordinal planning across month toggles.
- Preserve overlap visibility for multi-month goals.
- Keep current month/week/day UI surfaces.

**Out of scope for this phase**

- New year view or multi-month strip as a primary UX.
- Full scheduler redesign.

### A1. Shipped Baseline (already implemented in isolated branch)

Implement deterministic ordinal ownership for `deadline_total` and `milestone_sequence` so each ordinal belongs to one scope month across the goal lifetime.

- Keep canonical `unitKey` semantics (`total:n`, `milestone:n`).
- Keep existing overlap eligibility.
- Keep month-local solver execution, but feed it only the month-owned ordinal slice.

Primary files:

- [`src/lib/planner/work-units.ts`](src/lib/planner/work-units.ts)
- [`src/lib/planner/reconciliation.ts`](src/lib/planner/reconciliation.ts)
- [`src/features/planner/calendar-entries.ts`](src/features/planner/calendar-entries.ts)
- [`src/features/planner/calendar-surface.tsx`](src/features/planner/calendar-surface.tsx)

### A2. Defensive Merge Hygiene (Keep)

Boundary-day merge artifacts are a symptom, not the root cause, but retaining canonical-first merge behavior is useful:

- Prefer current-scope canonical entries.
- Suppress supplemental duplicates when identity already exists elsewhere canonically.

This prevents confusing boundary rendering when adjacent-month payloads diverge.

### A3. Must-Fix Remediation: Carry-Forward + Capacity-Aware Spill (before merge)

Extend ordinal allocation behavior so elapsed-month ownership does not strand required units:

- Keep deterministic ordinal ownership as the stable baseline.
- For elapsed months, carry forward uncredited ordinal obligations into current/future months.
- Allocate carry-forward against per-month capacity (allowed dates, constraints, and remaining placement room).
- Spill overflow into later months with slack before emitting shortfall.
- Preserve deterministic output for same canonical inputs.

Acceptance additions for this slice:

- Elapsed months never make uncredited ordinal units permanently unreachable when future capacity exists.
- Mid-month start scenarios do not produce avoidable permanent shortfall while later months have room.

### A4. Optional Stability Guardrails (follow-up)

If needed after soak:

- Add `PLANNER_HORIZON_ALLOCATION_ENABLED` as a kill switch.
- Add additional stale-plan detection only if mutable allocation paths are introduced later.
- Keep pinning/stability constraints as a hardening layer, not a prerequisite for this remediation pass.

### A5. Persistence Hardening (Phase 2)

Add horizon atomicity and cross-plan constraints after correctness is stable:

- Add horizon publish RPC wrapper that commits multiple months under one owner lock.
- Add cross-plan invariant preventing same `(original_goal_id, unit_key)` from being simultaneously active across conflicting plans.

Rationale: valuable integrity guarantee, but can follow A1/A2 shipping.

### A6. Coach and UI Enhancements (After correctness)

- Extend coach summary with horizon-level per-goal distribution context.
- Add compact horizon counters in planner header (for example, "12 this month / 104 total").

No major UI mode changes required.

### A7. Tests and Acceptance Criteria

Required tests:

- `work-units` multi-month ownership and no inflation.
- `kernel` month-toggle invariants.
- `calendar-entries` boundary dedupe regressions.
- visible context route regressions.

Acceptance criteria:

- For target goal with total `N`, union of ordinal keys across horizon months equals `N`.
- No month re-materializes full `N` unless it is the only month.
- Month toggle does not inflate occurrences beyond total.
- Cadence behavior remains unchanged.

---

## Workstream A Follow-Up - Coach Horizon Support (Post-#19)

PR #19 is merged on `main` and closes the core cross-month correctness defects (ordinal inflation, slice-relative crediting, carry-forward, and capacity-aware spill). This follow-up focuses on coach-driven multi-month planning behavior.

### Scope for this follow-up

- Skip additional #19 hardening in this slice.
- Make one coach apply action reshape all unpublished months.
- Add explicit horizon context so coach can reason about multi-month distributions.
- Allow one coach turn to update multiple goals, including per-month distribution ramps.

### Decisions

1. Distribution is per-goal, and one coach turn may modify multiple goals.
2. Distribution math is normalized, never hard-rejected for arithmetic mismatch.
3. No new tables and no new goal columns; distribution state lives in planner policy.
4. Durable planner preference writes happen on explicit apply actions (not passive auto-apply).

### Execution Order (implementation and PR split)

1. **C2 - Durable apply write-through**
   - On explicit apply, persist resulting policy through `PUT /api/planner/preferences` in addition to local draft refresh.
   - Preserve published-month semantics (`policy_changed` stale reason) and call out republish requirement in UX copy.
2. **C1 - Horizon context**
   - Extend kernel output with horizon summary for focus goals (total, credited, remaining, per-month planned).
   - Feed horizon block into deterministic coach summary and prompt context.
   - Use the same source for compact planner counters (for example, `12 this month / 104 total`).
3. **C3 - Multi-goal intent + monthly distribution**
   - Expand coach calendar intent envelope to support concurrent global and multi-goal edits.
   - Add policy patch kinds for monthly distribution set/clear.
   - Add optional `goalMonthlyDistributions` to policy schema and normalize deterministically.
   - Integrate distribution into ordinal ownership allocation before carry-forward/capacity spill.
4. **C4 - Tests**
   - Allocator normalization/spill/carry-forward determinism tests under distribution.
   - Coach intent compilation tests for multi-goal + global in one turn.
   - Coach policy apply tests for mixed in-scope/out-of-scope goal patch sets.
   - Coach context/prompt and UI behavior tests for durable apply + undo + error consistency.

### Explicitly deferred (not in this follow-up)

- Horizon publish atomicity.
- Cross-plan `(original_goal_id, unit_key)` uniqueness trigger.
- Additional #19 historical rerun hardening beyond merged behavior.

---

## Workstream B - XP, Levels, and Rewards

### B0. Scope and Non-Goals

**In scope**

- Global XP profile and level progression.
- Reversible per-completion XP with 25% cascade weighting.
- Reversible goal-achievement XP.
- Goal-level custom reward text.

**Out of scope in initial ship**

- Large reward campaign system.
- Complex social leaderboard mechanics.

### B1. Shipped Foundation (already implemented in isolated branch)

Schema foundation:

- `xp_levels`
- `xp_rewards`
- `xp_profiles`
- `xp_ledger`
- `goals.reward_text`

Behavior:

- Trigger-based XP capture on `public.completions` insert/delete.
- Manual completion XP baseline (currently 20 in SQL config).
- Cascade completion XP at 25% multiplier.
- Goal-achievement award/reversal on threshold transitions.
- Idempotency through ledger uniqueness + guarded transition logic.

Files:

- [`supabase/migrations`](supabase/migrations)
- [`src/app/api/xp/profile/route.ts`](src/app/api/xp/profile/route.ts)
- [`src/components/layout/app-shell.tsx`](src/components/layout/app-shell.tsx)
- [`src/features/today/goal-form.tsx`](src/features/today/goal-form.tsx)
- [`src/features/today/bulk-goal-form.tsx`](src/features/today/bulk-goal-form.tsx)

### B2. Must-Fix Remediation: XP Awards Must Follow Credited Progress (before merge)

Align XP granting to credited/admissible progress semantics:

- Do not award XP for completions outside goal active window.
- Do not award XP for future-dated completions (owner-local as-of semantics).
- Clamp ordinal XP awards to credited target limits.
- For cadence requirements, award XP only for credited period completion (not every raw row in same period).

Implementation preference for complexity control:

- Keep SQL as the single operational source of truth for awarding in this phase.
- Use targeted SQL tests to lock behavior instead of introducing a second full runtime oracle path.

### B3. Must-Fix Remediation: Achievement XP Lifecycle Recompute (before merge)

Ensure achievement XP stays correct when goals change:

- Re-evaluate/reverse/reapply achievement XP on goal updates affecting achievement state (`target_count`, date window, deletion flags).
- Reverse achievement XP on hard-delete cascades and on soft-delete transitions by policy.
- Preserve idempotency and reversibility guarantees.

### B4. Reward Lifecycle UX (Next)

Add explicit unlock lifecycle tables/API:

- `user_awards` with `acknowledged_at` and revocation fields.
- `POST /api/rewards/acknowledge`.
- one-time unlock toast behavior.

Show awards in Insights and keep re-earn behavior non-spammy.

### B5. Optional Recompute-and-Diff Evolution

If long-term reconciliation complexity grows, evolve toward projection recompute-and-diff architecture. Keep this as a later optimization track, not first rollout.

### B6. RLS and Integrity

- Owner-scoped RLS on user XP/ledger/award state.
- Client read-only access to XP projections.
- Service-side only mutation path for sensitive XP rows.

### B7. Tests and Acceptance Criteria

Required tests:

- SQL tests for idempotency, cascade multiplier, reversal, and achievement transitions.
- API tests for profile shape and auth handling.
- UI smoke coverage for reward field persistence.

Acceptance criteria:

- Mark/unmark cycles return XP to exact prior total.
- Cascade awards always reflect configured multiplier.
- Achievement awards trigger once when threshold crossed and reverse when threshold no longer met.
- XP is not awarded for non-credited completion rows (outside window, future-dated, over-target, duplicate-in-period).
- Goal edits/deletes cannot leave stale achievement XP behind.
- XP profile and level display remain stable across refresh/navigation.

---

## Sequencing (V2)

1. Keep the shipped baseline from **A1/A2** and **B1**.
2. Land **A3** remediation (carry-forward + capacity-aware spill) with added regressions.
3. Land Workstream A coach horizon follow-up in sequence: **C2 -> C1 -> C3 -> C4**.
4. Land **B2/B3** remediation (credited XP semantics + goal lifecycle recompute) with SQL coverage.
5. Run CI soak and telemetry monitoring after remediation merges.
6. Implement follow-up slices: **A4-A6** and **B4**.
7. Optional architecture evolution later: **A5** and **B5**.

---

## Verification Commands

Planner regression:

```bash
pnpm vitest run src/lib/planner src/features/planner/calendar-entries.test.ts src/app/api/planner/context/visible/route.test.ts
```

DB and contracts:

```bash
pnpm test:sql && pnpm test:concurrency
```

General quality:

```bash
pnpm typecheck && pnpm lint
```

---

## Open Follow-Ups

1. Add planner allocation kill switch + extra staleness guardrails only if soak shows churn risk.
2. Decide when to add cross-plan unit-key hardening + horizon publish atomicity.
3. Add coach horizon summary context and compact planner horizon counters.
4. Implement reward unlock lifecycle (newly unlocked state + acknowledgement + one-time announcements).
5. Improve XP refresh timing so same-view completions update the global XP bar immediately.
6. Add DB invariant so `xp_levels.min_total_xp` is monotonic with `level`.
7. Decide explicit cadence-goal achievement XP policy.
8. Decide whether global rewards remain one-per-level or expand to multi-trigger catalog semantics.
9. Audit the historical PR #12 empty-diff artifact and document root cause (base/target state vs branch content).
