# XP, Levels, and Rewards — Consolidated Plan

> **Provenance.** This consolidates two independent drafts: a product/process-led plan (`planner_xp_standalone_plan.md`) and an architecture-led plan (`xp_rewards_plan.md`). The architecture draft is the baseline — it carries the credited-progress design, the concrete DDL, and the schema verification. From the product draft it absorbs the contract-freeze gate (§3), reward unlock lifecycle as in-scope rather than deferred (§6.10, §7.5), the feature-flag and rollback posture (§2.6), operational telemetry (§10), per-phase exit criteria, and the ownership boundary (§13). Where the two disagreed on architecture, the baseline wins; where they disagreed on product scope, the product draft wins.

## Context

XP was originally scoped as "Workstream B" inside `docs/planner_xp_v2_plan.md`, which described it as already implemented. **It is not.** On the current tree there are zero XP migrations, zero XP API routes, zero XP UI, and no `goals.reward_text`.

The implementation the old doc referred to lives on `workstream-b-xp-foundation-clean-rebuilt` / `workstream-b-xp-ui-api-clean-rebuilt` (checked out at the sibling worktree `../Resolution-xp-stack-clean`). That branch forked **before** the entire Phase 0–13 additive cleanup — 129 files and roughly +5,054/−10,943 lines apart — and is not rebase-able. It is also actively incompatible with today's schema:

- It hardcodes `frequency_type in ('fixed_milestones','recurring')`, but `20260808154015_additive_phase12_backend_cleanup.sql` physically rebuilt the `goal_frequency_type` enum (dropping `one_time` via a `_v2` swap).
- It puts every table and function in schema `private`, which Phases 11–13 have been systematically dismantling. `private` is now down to `planner_state` plus helper functions; the established convention is `public` tables under RLS with `SECURITY DEFINER` `*_service` RPCs as the sole write path.
- Its awarding logic has four correctness defects (§2.2) and no referential integrity on the ledger.

**Decision: re-author from scratch on today's schema.** The stale branch is a design reference for constants, the level curve, and UI shape — nothing more.

### Branch and numbering

The additive cleanup series has reached **phase 22** (`backend-additive-phase22-remove-sync-scope-plumbing`). Phases 17–19 and 21–22 are TypeScript-only; the newest phase migration is `20260808183504_additive_phase20_drop_orphan_db_surfaces.sql`.

**New migrations start at phase XP-1.** Phases XP-1–XP-3 belong to this document; phases 26+ belong to [`social_consolidated_plan.md`](social_consolidated_plan.md), which consumes the ledger this plan builds. No re-verification against the cleanup series is needed — see the note below.

> **Migration phase labels.** These are `xp1`–`xp3`, deliberately **not** numbers in the
> `additive_phase<N>` series. That counter belongs to the backend cleanup workstream, which
> is advancing several phases per day on its own branches — it reached phase 28 while this
> document was being written. Borrowing it guarantees a collision and communicates nothing,
> since these phases are not part of that series. Ordering still comes from the migration
> timestamp, which is what Supabase actually uses; the label is only a human name.

### Intended outcome

A global and per-category XP ledger that is correct by construction — awards follow *credited progress*, not raw completion rows; every award is fully reversible; and the ledger is a durable, windowed, queryable source of truth that the social system can build feeds, challenges, and seasonal leaderboards on without ever recomputing goal semantics itself.

---

## 1. Locked decisions

1. Re-author fresh; the stale XP branches are reference only.
2. XP tracks are keyed on a **constrained goal category taxonomy**. `'global'` is the aggregate track and a reserved key.
3. Awarding follows credited progress semantics. No XP for out-of-window, future-dated, over-target, or duplicate-in-period completions.
4. Every award is reversible, and reversal is **append-only and signed** — never a `DELETE`. This is a hard dependency of the social plan.
5. Cascaded (`linked_cascade`) completions award a reduced multiplier, default 25%.
6. Level thresholds stay table-driven for runtime tuning without redeploys.
7. The ledger is the accounting source of truth. `xp_profiles` is a derived projection and must always equal the ledger sum.
8. **Goal-level custom reward text is supported** (`goals.reward_text`). This was a locked decision in the original V2 plan and is restored here.
9. **Reward unlock has an explicit lifecycle** — `user_awards` with acknowledgement, so an unlock is announced exactly once and never re-spams. In scope, not deferred.
10. **Scoring rules are frozen as tests before any migration is written** (§3).
11. **Everything ships behind `XP_ENABLED`, and schema changes are forward-only** (§2.6).

---

## 2. Architecture

### 2.1 Awarding lives in SQL, on a row trigger

`public.completions` has five writers:

| Writer | Location |
|---|---|
| `public.mark_goal_complete` | `supabase/migrations/006_helpers_and_rpc.sql:36` |
| `public.unmark_goal_complete` (cascading) | `supabase/migrations/012_cascade_unmark_goal_complete.sql:1` |
| `public.set_execution_plan_goal_date_fact_service` | `supabase/migrations/20260805020000_planner_write_mutations.sql:945` |
| `public.set_execution_plan_item_date_fact_service` | `supabase/migrations/20260805020000_planner_write_mutations.sql:1111` |
| Direct client insert/delete under RLS | policies `completions_insert_by_actor` / `completions_delete_by_actor`, `supabase/migrations/007_rls_policies.sql:57-72` |

…plus `supabase/seed.sql`. A service-layer awarder would silently miss the RLS path and the seed. **A row trigger on the table is the only complete integration point.** The stale design got this right; keep it.

### 2.2 Recompute-and-diff, not per-row delta

This is the load-bearing decision; everything else follows.

The stale design's central defect is structural, not a missing `if`. **Credited progress is a set property of a goal, not a property of a row:**

- Over-target clamping depends on the *ordering* of all rows — `getCreditedUnitCount` in [`src/lib/goals/admissible.ts:73`](../src/lib/goals/admissible.ts) is `Math.min(admissible.length, requirement.targetCount)`.
- Cadence dedupe depends on whether *another* row already occupies the anchored period.
- Deleting row #3 of 10 on a target-5 goal **promotes row #6 into credit**. No per-row delta can express that.

So: on any relevant change, recompute the full credited entitlement for one `(user_id, goal_id)` pair, and diff it against the ledger balance. The pair is a tiny bounded working set — at most a few hundred completions — so this is cheap.

One mechanism solves all of: correct credit semantics, achievement lifecycle, goal edits, category re-attribution, idempotency, reversibility, and backfill. It is strictly *less* code than the stale trigger, not more.

> `docs/planner_xp_v2_plan.md` §B5 parked recompute-and-diff as a *later* optimization. **Invert that.** Once correct credit semantics are a requirement, recompute-and-diff is the cheaper of the two designs.

### 2.3 The ledger diffs on balance, not on a unique constraint

The stale ledger used `unique (user_id, completion_id, event_type)`. That breaks on mark → unmark → re-mark: the second award collides with the first. Instead:

- The ledger is **append-only and signed**. Each row carries a `source_key` — the stable identity of the credited unit.
- "Currently credited" for a unit is `sum(xp_delta)` over its `(user_id, goal_id, source_key, track_key)` group.
- Recompute writes a compensating row **only when desired ≠ current balance**. If they match, zero rows are written → idempotent by construction, no unique constraint required.
- Amount changes are handled for free: if a completion's `source` flips `manual → linked_cascade`, one reversal row of `−15` is written. No special case.
- Concurrency is a `pg_advisory_xact_lock` on `(user_id, goal_id)`, mirroring the `private.planner_owner_lock_key` pattern.

### 2.4 Vocabulary is shared with the planner, not reinvented

`source_key` reuses the planner's canonical unit keys verbatim from [`src/lib/planner/work-units.ts:258,322`](../src/lib/planner/work-units.ts):

- `milestone:{ordinal}` and `total:{ordinal}` for ordinal kinds
- `cadence:{periodKey}` for cadence kinds

This makes the XP ledger and the planner's work units cross-checkable against one vocabulary, which reduces the deferred progress-oracle harness to a join.

### 2.5 No cron is required

Achievement XP is restricted to `milestone_sequence` and `deadline_total`, where achievement is *caused by a completion insert* and is therefore self-triggering. Cadence-goal achievement would depend on `end_date` passing with no accompanying write, requiring a scheduled job.

**Cadence achievement XP is explicitly out of scope.** This resolves the old open follow-up "decide explicit cadence-goal achievement XP policy." See §9 R3 for the invariant this creates.

---

### 2.6 Feature flag and rollback posture

XP is derived state computed by triggers, which makes rollback asymmetric: the schema is
trivial to keep, the *behaviour* is what needs a kill switch.

- **`XP_ENABLED`** in a new `src/lib/xp/capabilities.ts`, mirroring the env-var pattern in
  [`src/lib/planner/capabilities.ts`](../src/lib/planner/capabilities.ts). Default `false`.
  It gates the API route and every UI surface, so each phase merges dark.
- **The flag does not gate the triggers.** Ledger accrual should run from the moment the
  foundation migration lands, even while the UI is dark — otherwise enabling the flag later
  shows every user a sudden retroactive XP dump, and the backfill has to be re-run. Accrue
  silently, reveal deliberately.
- **Schema changes are forward-only.** No migration in this plan drops a column or table.
  If awarding logic proves wrong, the fix is to correct
  `private.goal_xp_credited_units` and run a recompute sweep — the diff engine converges
  every `(user, goal)` pair to the new rule with no data migration and no ledger rewrite.
  This is the single biggest operational advantage of recompute-and-diff over per-row delta.
- **The one-way door** is the point values and level curve, because they change what users
  have already been shown. Thresholds are table-driven (`xp_levels`) and safe to retune;
  the three point constants are not. See §12 Q5.

---

## 3. Phase gate: contract freeze (before any migration)

Adopted from the product draft, and it should genuinely gate the work: **write the scoring
acceptance tests first, get them approved, then write the migration.**

The reason is specific to this design. Credited-progress semantics are a *translation* of
existing TypeScript ([`admissible.ts`](../src/lib/goals/admissible.ts),
[`requirements.ts`](../src/lib/planner/requirements.ts),
[`periods.ts`](../src/lib/goals/periods.ts)) into SQL. Translations drift silently. If the
test matrix is written after the SQL, it tends to be written *from* the SQL — encoding
whatever the translation happens to do, including its bugs.

Freeze this matrix first, as executable pgTAP with the migration stubbed out:

| Rule | Frozen expectation |
|---|---|
| Ordinal cap | `deadline_total` with `target_count = 3` and 5 admissible completions credits 3 |
| Ordinal promotion | deleting credited unit #1 of 3 promotes #4 into credit; total unchanged |
| Cadence dedupe | two completions in one anchored period credit once |
| Cadence boundary | two completions in adjacent periods credit twice |
| Monthly clamping | anchor on the 31st buckets Feb 28 into the correct period |
| Window | `completed_on` outside `[start_date, end_date]` credits zero |
| Future | `completed_on > owner-local today` credits zero |
| Archive | credit clamps at `archived_at`, already-credited units are retained |
| Cascade weight | `linked_cascade` credits `floor(manual × 0.25)`, floored at 1 |
| Achievement | fires once at target; reverses when target rises above credited count |
| Cadence achievement | never fires (§2.5) |

**Exit criteria:** the matrix is approved and every row has a named pgTAP assertion. Two
of the frozen expectations depend on decisions this plan has already taken but which are
reversible at zero cost *before* the migration and at the cost of a ledger sweep after —
**soft delete reverses XP** (§8) and **group goals award achievement XP per participant**
(§12 D-2). Confirm both here rather than discovering them in review. Ambiguity resolved at
this gate costs a line of SQL; resolved after launch it costs a migration.

---

## 4. Phase XP-1 — Goal category taxonomy

**Migration:** `supabase/migrations/<ts>_additive_xp_phase1_goal_category_taxonomy.sql`

### 4.1 Two-level design: do not constrain `goals.category`

`goals.category` today is a free-text **display label** (`supabase/migrations/003_goals.sql:6`, `text not null default 'general'`), written by three client surfaces via `getCategoryLabel()` in [`src/lib/goals/category.ts:50`](../src/lib/goals/category.ts), which returns `"Personal" | "Relationships" | "Health"` or an arbitrary user string.

Custom category labels are a shipped feature (`goal-form.tsx` has a "Custom category label" input), and `today-tab.tsx` builds its filter chips from distinct raw label values. `supabase/seed.sql` contains `career`, `fitness`, `learning`, `finance`, `community`, `wellness`; pgTAP fixtures contain `'test'` and `'Health'`. Constraining the column would break all of that.

**Instead: add `goals.category_key` as the constrained taxonomy dimension and keep `category` as the free-text display label.** `category_key` is the XP track dimension.

### 4.2 `public.goal_categories`

```sql
create table if not exists public.goal_categories (
  key        text primary key,
  label      text not null,
  aliases    text[] not null default '{}'::text[],
  color      text,
  sort_order integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint goal_categories_key_format
    check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint goal_categories_key_not_reserved
    check (key <> 'global'),
  constraint goal_categories_label_length
    check (pg_catalog.length(label) between 1 and 60),
  constraint goal_categories_aliases_bounded
    check (pg_catalog.cardinality(aliases) <= 24)
);
create unique index if not exists goal_categories_sort_order_idx
  on public.goal_categories (sort_order);
```

`key <> 'global'` reserves `'global'` for the aggregate XP track (§5.3), which is why `xp_ledger.track_key` and `xp_profiles.track_key` need no FK — a format check plus a controlled writer is sufficient, and it avoids a third lookup table.

**`key` is `text`, not a `smallint` id.** It is self-describing in ledger rows, feed payloads, and challenge configs, and there is no volume argument at this scale.

Seed (idempotent `on conflict (key) do update`), chosen to cover every value actually present in `supabase/seed.sql` plus the three UI presets:

| key | label | aliases |
|---|---|---|
| `health` | Health | `fitness`, `wellness`, `wellbeing`, `exercise`, `workout`, `nutrition`, `sleep` |
| `relationships` | Relationships | `family`, `friends`, `social`, `community`, `partner` |
| `personal` | Personal | `self`, `habits`, `mindfulness`, `home` |
| `learning` | Learning | `education`, `study`, `skills`, `reading`, `languages` |
| `career` | Career | `work`, `professional`, `business`, `job` |
| `finance` | Finance | `money`, `budget`, `savings`, `investing` |
| `other` | Other | `general`, `uncategorized`, `misc`, `custom`, `test` |

Adding a track later is an `insert`, not a schema change. Note `'general'` — the `goals.category` column default — maps to `other`, not `personal`, so unlabelled legacy rows do not inflate a real track.

### 4.3 Normalization

```sql
create or replace function private.normalize_goal_category_key(p_category text)
returns text language sql stable set search_path = '' as $$
  with candidate as (
    select pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.btrim(coalesce(p_category, ''))),
      '[^a-z0-9]+', '_', 'g'
    ) as slug
  )
  select coalesce(
    (select cat.key from public.goal_categories cat, candidate
      where cat.key = candidate.slug),
    (select cat.key from public.goal_categories cat, candidate
      where candidate.slug = any(cat.aliases) order by cat.sort_order limit 1),
    'other'
  );
$$;
```

Aliases live in table data, not code — retuning the mapping is an `update`, not a migration rewrite.

### 4.4 Column and derivation trigger

```sql
alter table public.goals add column if not exists category_key text;
update public.goals
  set category_key = private.normalize_goal_category_key(category)
  where category_key is null;
alter table public.goals alter column category_key set default 'other';
alter table public.goals alter column category_key set not null;
```

Plus a guarded `do $$ ... pg_catalog.pg_constraint ... $$` block adding `goals_category_key_fkey foreign key (category_key) references public.goal_categories(key) on update cascade on delete restrict`, and `create index if not exists goals_category_key_idx on public.goals (category_key);`.

The derivation trigger is what lets phase XP-1 ship with **zero client changes**:

```sql
create or replace function private.derive_goal_category_key()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.category_key is null or new.category_key = 'other' then
      new.category_key := private.normalize_goal_category_key(new.category);
    end if;
  elsif new.category_key is distinct from old.category_key then
    null;                                   -- explicit client choice wins
  elsif new.category is distinct from old.category then
    new.category_key := private.normalize_goal_category_key(new.category);
  end if;
  return new;
end; $$;
-- BEFORE INSERT OR UPDATE ON public.goals FOR EACH ROW
```

Because it is `BEFORE`, the `not null` check runs after derivation. Existing clients keep sending only `category` and get a correct `category_key` for free.

### 4.5 RLS and grants

RLS enabled; a single `goal_categories_read` SELECT policy for `authenticated` using `true`; `revoke all` from `public, anon, authenticated, service_role` then `grant select` to `authenticated, service_role`. **No write policy** — the catalog is migration-managed only, consistent with Phase 11–13 conventions. `revoke execute on function private.normalize_goal_category_key(text) from public, anon, authenticated`.

---

## 5. Phase XP-2 — Future-dated completion guard

**Migration:** `supabase/migrations/<ts>_additive_xp_phase2_completion_future_date_guard.sql`

### 5.1 Why this is a prerequisite, not a nice-to-have

XP is credited only for `completed_on <= local_today`. A future-dated completion inserted today therefore earns 0 XP — and because nothing re-runs recompute when the calendar advances (§2.5), it earns 0 XP **forever**. That is a silent permanent-loss bug.

The planner RPCs already reject this (`future_completion_not_allowed`, `supabase/migrations/20260805020000_planner_write_mutations.sql:912,1108`), but `public.mark_goal_complete` and the RLS direct-insert path do not. Closing the hole at the table covers every writer at once.

```sql
create or replace function private.guard_completion_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_timezone text;
begin
  select p.timezone into v_timezone from public.profiles p where p.id = new.user_id;
  if v_timezone is null then return new; end if;
  if new.completed_on > private.local_today_for_timezone(v_timezone) then
    raise exception using errcode = '23514', message = 'future_completion_not_allowed';
  end if;
  return new;
end; $$;
-- BEFORE INSERT OR UPDATE ON public.completions FOR EACH ROW
```

Uses the **actor's** timezone (`new.user_id`), not the goal owner's — correct for group goals, where a participant in Sydney and an owner in New York legitimately disagree about "today".

### 5.2 What is deliberately not guarded

Out-of-window completions (`completed_on < start_date` or `> end_date`) are **not** rejected. The planner path rejects them, but the today-tab/RLS path historically permits them, and rejecting at the table would be a user-visible behavior change unrelated to XP. They simply earn no XP, which is the correct credited-progress answer.

### 5.3 Ordering

Phase XP-2 must land **before** phase XP-3, so no future-dated rows can be created between the two merges. Rows that already exist remain permanently uncredited; that is acceptable, and §12 D2 notes the reconcile escape hatch if it ever matters.

---

## 6. Phase XP-3 — XP foundation

**Migration:** `supabase/migrations/<ts>_additive_xp_phase3_xp_foundation.sql`

Everything lives in `public` under RLS, with `SECURITY DEFINER` functions as the sole write path. Nothing new goes into `private` except pure helpers.

### 6.1 `public.xp_levels`

```
level        integer primary key check (level >= 1)
min_total_xp integer not null unique check (min_total_xp >= 0)
title        text not null, check length 1..100
created_at   timestamptz not null default now()
```

Seeded 1..10 at `0 / 100 / 250 / 450 / 700 / 1000 / 1400 / 1900 / 2500 / 3200`.

A `check` cannot see other rows, so monotonicity gets a statement-level assertion trigger — closing the old open follow-up "add DB invariant so `xp_levels.min_total_xp` is monotonic with `level`":

```sql
create or replace function private.assert_xp_levels_monotonic()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.xp_levels lo join public.xp_levels hi
      on lo.level < hi.level and lo.min_total_xp >= hi.min_total_xp
  ) then
    raise exception using errcode = '23514',
      message = 'xp_levels.min_total_xp must increase with level';
  end if;
  return null;
end; $$;
-- AFTER INSERT OR UPDATE OR DELETE ON public.xp_levels FOR EACH STATEMENT
```

### 6.2 `public.xp_rewards`

```
id                 uuid primary key default gen_random_uuid()
level              integer not null references public.xp_levels(level) on delete cascade
reward_code        text not null unique, check ~ '^[a-z0-9._-]{1,100}$'
reward_title       text not null, check length 1..200
reward_description text not null, check length 1..500
created_at         timestamptz not null default now()
unique (level)
```

Seeded at levels 2, 4, 6, 8, 10.

**No `track_key` column here, deliberately** — reversing an earlier draft of this plan.
Rewards are global because levels are global; per-track reward catalogues are not built, not
scheduled, and may never be wanted. Shipping the column now would mean a `not null default
'global'` that every row carries and no code reads, plus a composite unique constraint
defending a case that does not exist. If per-track rewards are ever built, `add column` plus
`drop constraint` / `add constraint` is a ten-line migration on a table with fewer than
twenty rows. See *Debt avoidance* rule 3.

### 6.3 `public.xp_profiles` — keyed `(user_id, track_key)`

```sql
create table if not exists public.xp_profiles (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  track_key     text not null,
  total_xp      integer not null default 0 check (total_xp >= 0),
  current_level integer not null references public.xp_levels(level),
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  primary key (user_id, track_key),
  constraint xp_profiles_track_key_format
    check (track_key ~ '^[a-z][a-z0-9_]{1,31}$')
);
create index if not exists xp_profiles_leaderboard_idx
  on public.xp_profiles (track_key, total_xp desc, user_id);
```

`'global'` is just another track. Per-category totals need no second table, and one index shape serves the global board and every per-category board. This is the concrete realization of the old "multi-track extensibility guardrail" and closes the old follow-up about finalizing the multi-track migration shape. A jsonb per-category column was rejected — unindexable for the downstream leaderboard consumer.

Note `check (total_xp >= 0)` with **no** `greatest(..., 0)` clamping anywhere. The stale `apply_xp_delta` clamped, which is precisely how it hid the drift caused by its missing FKs. Here, a negative total is a bug and must fail loudly.

### 6.4 `public.xp_ledger`

```sql
create table if not exists public.xp_ledger (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  goal_id           uuid references public.goals(id) on delete cascade,   -- nullable
  completion_id     uuid references public.completions(id) on delete set null,
  track_key         text not null,
  event_type        text not null,
  entry_kind        text not null,
  source_key        text not null,
  xp_delta          integer not null,
  earned_on         date not null,
  completion_source public.completion_source,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default pg_catalog.now(),
  constraint xp_ledger_track_key_format
    check (track_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint xp_ledger_event_type_valid
    check (event_type in ('completion_credit','goal_achievement',
                          'challenge_award','season_award')),
  constraint xp_ledger_entry_kind_valid
    check (entry_kind in ('award','reversal')),
  constraint xp_ledger_entry_kind_sign
    check ((entry_kind = 'award'    and xp_delta > 0)
        or (entry_kind = 'reversal' and xp_delta < 0)),
  constraint xp_ledger_goal_scoped_events
    check (goal_id is not null
        or event_type in ('challenge_award','season_award')),
  constraint xp_ledger_source_key_format
    check (pg_catalog.length(source_key) between 1 and 100),
  constraint xp_ledger_metadata_shape
    check (pg_catalog.jsonb_typeof(metadata) = 'object'
       and pg_catalog.octet_length(metadata::text) <= 4096)
);

create unique index if not exists xp_ledger_seq_key
  on public.xp_ledger (seq);
create index if not exists xp_ledger_balance_idx
  on public.xp_ledger (user_id, goal_id, source_key, track_key);
create index if not exists xp_ledger_user_earned_idx
  on public.xp_ledger (user_id, earned_on desc, seq desc);
create index if not exists xp_ledger_track_earned_idx
  on public.xp_ledger (track_key, earned_on desc, seq desc);
create unique index if not exists xp_ledger_nongoal_award_key
  on public.xp_ledger (user_id, event_type, source_key)
  where goal_id is null;
```

Design notes, several of which are contracts the social plan depends on:

- **Real FKs.** `user_id` and `goal_id` cascade; `completion_id` is soft provenance with `on delete set null` so reversal rows survive the completion they reverse. The stale ledger had no FKs at all, so deletes orphaned rows and left `xp_profiles.total_xp` inflated.
- **`goal_id` is nullable** so the social system can write `challenge_award` / `season_award` rows that are not goal-attributed. `xp_ledger_goal_scoped_events` keeps XP-owned events goal-scoped, and `xp_ledger_nongoal_award_key` makes non-goal awards exactly-once by construction — no separate `idempotency_key` column is needed.
- **`event_type` is a closed set.** `completion_credit` and `goal_achievement` are owned by this plan; `challenge_award` and `season_award` are owned by the social plan and are listed here only so the check constraint does not need editing later.
- **`seq` is the change-feed cursor.** Gap-free and monotonic. `created_at` timestamps are not safe cursors under concurrency; any consumer paginating the ledger must use `seq`.
- **`earned_on` is the accounting axis and is owner-local.** A reversal row carries the `earned_on` of the credit it cancels, so a late reversal correctly reduces the *original* season rather than the current one. Seasonal aggregation must window on `earned_on`, never `created_at`. Getting this backwards is the classic seasonal-leaderboard bug.
- **`track_key` is denormalized on every row**, so per-category windowed sums are a single index scan with no join to `goals` (which may be soft-deleted or re-categorized).

### 6.5 Config and period helpers (`private`)

```
private.xp_manual_completion_points()  -> 20    immutable
private.xp_cascade_multiplier()        -> 0.25  immutable
private.xp_goal_achievement_points()   -> 100   immutable
private.xp_points_for_completion_source(public.completion_source) -> integer
private.xp_level_for_total(integer) -> integer  stable, reads xp_levels
```

`linked_cascade` yields `greatest(1, floor(20 * 0.25)) = 5`.

`private.goal_anchored_period_start(p_anchor date, p_interval public.recurrence_interval, p_index integer)` and `private.goal_period_key(p_anchor date, p_interval public.recurrence_interval, p_reference date)` are **exact SQL mirrors** of `getAnchoredPeriodStart` and `getAnchoredPeriod` in [`src/lib/goals/periods.ts:93,121`](../src/lib/goals/periods.ts):

- `daily` → `p_anchor + p_index`; key is the reference date.
- `weekly` → `p_anchor + p_index * 7`; key is `p_anchor + ((p_reference - p_anchor) / 7) * 7`. Safe because admissible completions always satisfy `p_reference >= p_anchor`, so Postgres integer truncation equals `Math.floor`.
- `monthly` → month-anchored with day clamping:
  ```sql
  v_month_start := (date_trunc('month', p_anchor)
                    + pg_catalog.make_interval(months => p_index))::date;
  return v_month_start + (
    least(extract(day from p_anchor)::int,
          extract(day from (v_month_start + interval '1 month - 1 day'))::int) - 1
  );
  ```
  followed by the same decrement/increment convergence loop the TypeScript uses.

This mirroring is a real correctness risk; §8.2 specifies a cross-runtime parity fixture to pin it.

### 6.6 Credited-unit projection

```sql
create or replace function private.goal_xp_credited_units(p_user_id uuid, p_goal_id uuid)
returns table (
  source_key text, track_key text, event_type text, earned_on date,
  completion_id uuid, completion_source public.completion_source, xp_amount integer
)
language plpgsql stable security definer set search_path = '';
```

This is the SQL translation of [`src/lib/goals/admissible.ts`](../src/lib/goals/admissible.ts) + [`src/lib/planner/requirements.ts`](../src/lib/planner/requirements.ts) + the archive clamp in [`src/lib/goals/lifecycle.ts:41`](../src/lib/goals/lifecycle.ts):

1. Load the goal and the actor's profile timezone. If the goal is missing **or `is_deleted = true`**, return zero rows (this is what makes soft delete reverse XP; see §7).
2. `v_as_of := private.local_today_for_timezone(profile.timezone)`. If `archived_at is not null`, clamp: `v_as_of := least(v_as_of, (archived_at at time zone profile.timezone)::date)`, mirroring `getGoalOutcome`.
3. `v_credit_end := least(v_as_of, coalesce(end_date, v_as_of))`.
4. Admissible set = completions for this `(user, goal)` with `completed_on between start_date and v_credit_end`. This is `isCompletionAdmissible`, and it kills **out-of-window** and **future-dated** farming.
5. Requirement kind, from `getGoalRequirement`:
   - `frequency_type = 'fixed_milestones'` → `milestone_sequence`, target `greatest(1, coalesce(target_count, 1))`
   - `frequency_type = 'recurring' and target_count > 0` → `deadline_total`, target `target_count`
   - otherwise → `cadence`, interval `coalesce(recurrence_interval, 'daily')`

   This reads `frequency_type` through the **rebuilt two-value enum** from `20260808154015_additive_phase12_backend_cleanup.sql`, with no `one_time` branch. This is the fix for the stale design's enum incompatibility.
6. Ordinal kinds: `row_number() over (order by completed_on asc, id asc)`, take rows `1..target`, `source_key = 'milestone:' || n` or `'total:' || n`. Kills **over-target** farming.
7. Cadence: `distinct on (private.goal_period_key(start_date, interval, completed_on)) ... order by period_key, completed_on asc, id asc`, `source_key = 'cadence:' || period_key`. Kills **duplicate-in-period** farming.
8. `xp_amount = private.xp_points_for_completion_source(completion_source)`; `earned_on = completed_on`; `track_key = goal.category_key`; `event_type = 'completion_credit'`.
9. Achievement: if the kind is `milestone_sequence` or `deadline_total` **and** `count(credited) >= target`, emit one extra row with `source_key = 'achievement'`, `event_type = 'goal_achievement'`, `earned_on = max(credited.earned_on)`, `xp_amount = private.xp_goal_achievement_points()`, `completion_id = null`.

### 6.7 The diff engine

```sql
create or replace function public.recompute_goal_xp_service(
  p_user_id uuid, p_goal_id uuid, p_force_zero boolean default false
) returns integer  -- ledger rows written
language plpgsql security definer set search_path = '';
```

1. `pg_advisory_xact_lock(hashtextextended('resolution.xp:' || p_user_id || ':' || p_goal_id, 9021773411))`.
2. `desired` = `p_force_zero ? empty : private.goal_xp_credited_units(...)`.
3. `current` = ledger rows for the pair grouped by `(source_key, track_key)` with `sum(xp_delta)`, `having sum(xp_delta) <> 0`.
4. `full outer join` on `(source_key, track_key)`; `v_delta = coalesce(desired.xp_amount, 0) - coalesce(current.balance, 0)`; insert one row per `v_delta <> 0` with the matching `entry_kind` and `earned_on = coalesce(desired.earned_on, current.earned_on)`.
5. `private.refresh_xp_profile(p_user_id, <tracks touched>)` — upserts `('global', total over
   all rows)` plus one row per touched track, recomputing `current_level` from
   `private.xp_level_for_total`.

**`refresh_xp_profile` takes its own per-user advisory lock**, as its first statement:

```sql
perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('resolution.xp.profile:' || p_user_id::text, 9021773411));
```

This is not redundant with the caller's lock, and omitting it is a genuine lost update. The
two writers lock different keys — `recompute_goal_xp_service` on
`resolution.xp:<user>:<goal>` and `award_social_xp_service` (§6.12) on
`resolution.xp:<user>:social` — so they do not exclude each other. Both then recompute
`total_xp` as `sum(xp_delta)` over the user's ledger rows and write it. Under `READ
COMMITTED`, each computes its sum from a snapshot that cannot see the other's uncommitted
rows, so whichever commits second overwrites the first's contribution and `xp_profiles`
silently loses XP. The §10.2 drift job would report it the next morning; the lock prevents
it.

The per-goal and per-social locks stay — they serialise *ledger diffing* for their own scope,
which is a different concern and a narrower one. Only the profile projection needs a
user-wide lock, and putting it inside `refresh_xp_profile` means no future caller can forget
it. `pnpm test:concurrency` gains a case: a goal recompute and a challenge award for the same
user, committed concurrently, must leave `total_xp` equal to `sum(ledger)`.

Grants: `revoke execute from public, anon, authenticated`; `grant execute ... to service_role` for the backfill and any future admin reconcile. User-facing paths reach it only through triggers.

### 6.8 Triggers

All are `security definer` with `set search_path = ''`, and **all early-return** when `pg_catalog.current_setting('app.planner_deleting_profile_id', true)` matches the affected user, reusing the GUC set by the profile-deletion path in `supabase/migrations/20260804162311_core_planner_persistence.sql:143,218`. This keeps profile deletion O(1) instead of O(completions).

| Trigger | Timing | Action |
|---|---|---|
| `completions_xp_recompute` | `AFTER INSERT OR UPDATE OR DELETE ON public.completions FOR EACH ROW` | recompute the affected pair; on UPDATE also recompute the old pair if it changed |
| `goals_xp_recompute` | `AFTER UPDATE ON public.goals FOR EACH ROW` | if any of `target_count, start_date, end_date, frequency_type, recurrence_interval, is_deleted, archived_at, category_key, owner_id` changed → recompute for every distinct completing user |
| `goals_xp_reverse_on_delete` | `BEFORE DELETE ON public.goals FOR EACH ROW` | for each distinct completing user, recompute with `p_force_zero => true` |
| `profiles_xp_initialize` | `AFTER INSERT ON public.profiles FOR EACH ROW` | insert `(id, 'global', 0, 1)` |

**Why `BEFORE DELETE` + force-zero works alongside `on delete cascade`:** the trigger writes reversal rows bringing the goal's net ledger contribution to exactly 0, then refreshes the profile from the full ledger sum. The cascade then removes that goal's ledger rows — whose net is 0 — leaving the already-written profile total correct. The stale design's inflated-total bug is fixed by construction rather than by a compensating update.

### 6.9 RLS and grants

RLS is enabled on **all five** XP tables. `revoke all` from
`public, anon, authenticated, service_role`, then re-grant as below.

| Table | `authenticated` SELECT | Write path |
|---|---|---|
| `xp_levels` | `using (true)` — public catalogue | migration only |
| `xp_rewards` | `using (true)` — public catalogue | migration only |
| `xp_profiles` | `user_id = (select auth.uid())` | `private.refresh_xp_profile` only |
| `xp_ledger` | `user_id = (select auth.uid())` | `recompute_goal_xp_service`, `award_social_xp_service` |
| `user_awards` | `user_id = (select auth.uid())` | `private.refresh_xp_profile` (insert), `acknowledge_user_award_service` (§7.5) |

**`user_awards` acknowledgement must be an RPC, not an `UPDATE` policy.** The only column a
user may change is `acknowledged_at`, and PostgreSQL RLS has no column-level restriction —
a policy permitting `update` on the row permits `update` on `unlocked_at` and `revoked_at`
too, letting a user un-revoke their own award. This is the same argument that keeps roles
out of `profiles` in the social plan (§7.1 there), and it lands the same way: one narrow
`SECURITY DEFINER` RPC, zero write policies.

**No insert/update/delete policy on any XP table.** The only write path is `SECURITY DEFINER` functions running as the table owner, matching the Phase 11–13 `*_service` convention. All `private.*` XP functions get `revoke execute ... from public, anon, authenticated`.

`xp_profiles` stays owner-only. Public leaderboards are the social plan's problem and should use a `SECURITY DEFINER` top-N RPC rather than a widened policy — see §12, *Genuinely open* Q1.

### 6.10 `goals.reward_text` and `public.user_awards`

Both are in the foundation migration. The schema is cheap and additive; deferring it only
guarantees a second migration against the same tables later.

```sql
alter table public.goals add column if not exists reward_text text;
-- guarded constraint: reward_text is null or length(reward_text) <= 500

create table if not exists public.user_awards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reward_id       uuid not null references public.xp_rewards(id) on delete cascade,
  unlocked_at     timestamptz not null default pg_catalog.now(),
  acknowledged_at timestamptz,
  revoked_at      timestamptz,
  unique (user_id, reward_id)
);
create index if not exists user_awards_pending_idx
  on public.user_awards (user_id, unlocked_at desc) where acknowledged_at is null;
```

No `track_key` here: rewards are global (§6.2), so the reward's level is the whole key.

`private.refresh_xp_profile` inserts a `user_awards` row when the global `current_level`
crosses a reward level, `on conflict (user_id, reward_id) do nothing`.

**Regression sets `revoked_at`; it never deletes.** A user who crosses level 4, has XP
reversed, and re-crosses it must not get a second unlock announcement — the `unique`
constraint plus `do nothing` guarantees that, and the retained row keeps the feed and any
history stable. This is the "non-spammy re-earn" requirement made structural rather than
behavioural.

`goals.reward_text` is per-goal copy the user writes for themselves; it is **never**
published to the social feed, and it is not a track, a level, or an award. It is displayed
on goal achievement.

### 6.11 Backfill is the runtime path

```sql
insert into public.xp_profiles (user_id, track_key, total_xp, current_level)
select p.id, 'global', 0, private.xp_level_for_total(0) from public.profiles p
on conflict (user_id, track_key) do nothing;

do $$ declare r record; begin
  for r in select distinct c.user_id, c.goal_id
           from public.completions c join public.goals g on g.id = c.goal_id
  loop perform public.recompute_goal_xp_service(r.user_id, r.goal_id); end loop;
end $$;
```

Because recompute *is* the awarding logic, backfill and runtime are the same code. The stale design duplicated its award formula in a separate `insert ... select`, which is exactly how backfill and runtime drift.

Scale note: this is small today. If production volume exceeds a few hundred thousand pairs, split the loop into a follow-up admin script driven by the service-role client rather than blocking the migration.

---

### 6.12 The social award write path — `award_social_xp_service`

[`social_consolidated_plan.md`](social_consolidated_plan.md) grants XP for challenge and
season outcomes. **It must never insert into `public.xp_ledger` directly.**

The reason is specific and non-obvious. Every goal-scoped ledger write goes through
`recompute_goal_xp_service`, which calls `private.refresh_xp_profile` as its final step
(§6.7). A raw insert skips that call, so `xp_ledger` gains a row and `xp_profiles.total_xp`
does not move — which violates the §9.4 invariant *immediately and permanently*, breaks
level progression, and mis-fires reward unlocks. It is not a drift risk; it is a guaranteed
drift.

So XP owns the write, and social calls it:

```sql
create or replace function public.award_social_xp_service(
  p_user_id    uuid,
  p_event_type text,      -- 'challenge_award' | 'season_award'
  p_source_key text,      -- caller-supplied stable identity
  p_xp         integer    -- signed: positive awards, negative revokes
) returns bigint           -- xp_ledger.seq, or null when nothing was written
language plpgsql security definer set search_path = ''
```

**`earned_on` is derived inside the RPC, never passed in.** It is
`private.local_today_for_timezone(profile.timezone)` for `p_user_id` — the *recipient's*
local date, consistent with every other `earned_on` in the ledger (§6.4).

This is deliberately not a parameter. A caller reaching for a date will reach for
`current_date`, which is the **server's** date: for a user in Auckland awarded at 10:00
local, `current_date` is the previous day, so the award lands in the wrong local day and,
near a boundary, the wrong leaderboard season. Removing the parameter makes that class of
bug unrepresentable rather than merely discouraged — the same reasoning that keeps
`entry_kind` and `track_key` out of the caller's hands.

Behaviour:

1. Reject `p_event_type not in ('challenge_award','season_award')` — this RPC cannot be
   used to forge completion credit.
2. Reject `p_xp = 0`.
3. `pg_advisory_xact_lock` on `('resolution.xp:' || p_user_id || ':social')` so concurrent
   challenge and season refreshes serialise per user.
4. Insert with the columns the caller does **not** get to choose:
   - `entry_kind` = `'award'` when `p_xp > 0`, `'reversal'` when `p_xp < 0` (the sign check
     constraint in §6.4 makes any other pairing impossible)
   - `track_key` = **always `'global'`** — see below
   - `goal_id` = `null`, `completion_id` = `null`, `completion_source` = `null`
   - `earned_on` = `private.local_today_for_timezone(<recipient's profile timezone>)` —
     derived, never supplied (see above)
   - `on conflict do nothing` against `xp_ledger_nongoal_award_key`
5. If and only if a row was actually inserted, call
   `private.refresh_xp_profile(p_user_id, array['global'])`.
6. Return the new `seq`, or `null` on conflict. **A `null` return is the success path for a
   retry**, not an error — it is what makes the 15-minute challenge refresh idempotent.

`revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`

**A social-owned `AFTER UPDATE` trigger on `public.xp_profiles` is permitted**, the same way
§2.3d permits one on `public.xp_ledger`. The social plan uses it to emit `level_up` feed events
when `current_level` rises. XP does not implement, call, or know about that trigger — the
coupling stays one-directional, and `refresh_xp_profile` needs no social awareness.

**Why social awards always credit `'global'` and never a category track.** A category-scoped
challenge ("most Health XP in March") could plausibly credit the `health` track. It must not,
because that closes a feedback loop: win the Health challenge → gain Health XP → rank higher
on the Health leaderboard → win again. Category tracks are meant to measure what a user
*did*, and letting them absorb prize XP makes them measure what a user *won*. Global XP is
the score; category tracks are the breakdown of earned work.

This also keeps the two systems cleanly separable: no social feature can ever change a
category track total, so `sum(ledger where track_key = 'health')` is always exactly the
credited Health work.

**Idempotency depends on `source_key` being deterministic.** It must be a pure function of
the contest and the subject — `'challenge:' || challenge_id || ':' || subject_kind || ':' || subject_id`.
Do **not** vary it per member of a duo: the unique index is
`(user_id, event_type, source_key)`, so two members already differ by `user_id`, and making
the key member-specific would defeat the conflict check on re-run.

---

## 7. Phase S-1+ — Taxonomy adoption, API, and UI

These are TypeScript-only PRs and do not consume additive-phase migration numbers. They interleave with the social plan's phases; the ordering constraint is only that each depends on the migration named.

### 7.1 Category taxonomy UI and CSV adoption (after phase XP-1)

Goals are written directly from the browser under RLS, so the category selector must eventually produce a real `category_key`.

- **[`src/lib/goals/category.ts`](../src/lib/goals/category.ts):** replace the hardcoded `CategoryPresetId` union with a `GoalCategory { key, label, aliases, color, sortOrder }` loaded from `public.goal_categories` via supabase-js (RLS already grants `select` to `authenticated` — no new API route). Keep a small static fallback style map so `getCategoryBadgeClass` stays synchronous for render paths, keyed by `category_key` with an `other` default, retaining the existing Tailwind swatch classes. `getCategorySelectionFromValue` becomes `resolveCategoryKey(label, catalog)`, mirroring `private.normalize_goal_category_key`.
- **[`src/features/today/goal-form.tsx`](../src/features/today/goal-form.tsx):** populate the category `Select` from the catalog; `custom` remains selectable and writes `category = <user text>` **and** `category_key = 'other'`. Submit sends both fields.
- **[`src/features/today/bulk-goal-form.tsx`](../src/features/today/bulk-goal-form.tsx)** — the highest-risk consumer. Column aliases gain `category_key`; CSV header hints, placeholder text, and "Supported columns" help text update; row parsing resolves both label and key. Legacy CSVs carrying only `category` still work — worst case the phase-19 derivation trigger fixes the key server-side.
- **[`src/app/api/bulk-goals/parse/route.ts`](../src/app/api/bulk-goals/parse/route.ts):** the LLM output schema gains `category_key` as an enum of the seeded keys; the prompt and the default fallback update.
- **[`src/features/today/today-tab.tsx`](../src/features/today/today-tab.tsx):** filter chips switch from distinct raw labels to `category_key` with catalog labels. This also fixes today's behavior where `"Fitness"` and `"fitness"` produce two separate chips — cosmetic, intended, worth a line in the PR description.
- **[`src/lib/goals/types.ts`](../src/lib/goals/types.ts):** add `category_key`. Better: replace the hand-maintained `Goal`/`Profile` interfaces with aliases over the generated types — see the social plan's §11.4, which owns that change.

### 7.2 Shared prerequisite: generic API route context

**This is one PR shared with [`social_consolidated_plan.md`](social_consolidated_plan.md) §10. Do not build it twice.**

There is no generic non-planner auth helper; everything useful lives in [`src/lib/planner/api.ts`](../src/lib/planner/api.ts) (`PlannerRouteError`, `parseBoundedJsonBody`:97, `requirePlannerRouteContext`:161, `requirePlannerAdminClient`:149, `createCorrelationId`:31, `plannerErrorResponse`:35). `src/app/api/completions/exact-date/route.ts` is already an ad-hoc copy of the envelope; XP would be copy #3.

Extract the domain-neutral pieces into `src/lib/api/` (`errors.ts`, `body.ts`, `context.ts`)
under neutral names, **update every planner route to import from the new location, and delete
the old names.** `requirePlannerRouteContext` stays in `src/lib/planner/api.ts` and keeps the
planner-specific capability gating, delegating its auth half to `src/lib/api/context.ts`.

An earlier draft proposed leaving `src/lib/planner/api.ts` re-exporting the old names as
aliases so that no planner route file changed — "a move plus aliases, trivially reviewable."
That is exactly the pattern cleanup phases 15 and 16 are removing right now, and it is worth
being blunt about why the argument is seductive and wrong: optimising for a small diff in
*this* PR creates two permanent names for one thing, and the second name never dies because
removing it is always someone else's cleanup. The honest version touches about a dozen import
lines, is verified by `pnpm typecheck`, and leaves one name. See *Debt avoidance* rule 2.

### 7.3 `GET /api/xp/profile` (after phase XP-3)

**New `src/app/api/xp/profile/route.ts`** — `export const runtime = "nodejs"`, `Cache-Control: no-store`, `schemaVersion: "1"`, error envelope `{code, message, correlationId, details?}` via the §6.2 helpers.

```ts
{
  schemaVersion: "1",
  correlationId: string,
  profile: {
    totalXp, currentLevel, currentLevelMinXp,
    nextLevel: number | null, nextLevelMinXp: number | null,
    xpToNextLevel: number | null,
  },
  tracks: Array<{ trackKey, label, totalXp, currentLevel }>,  // by goal_categories.sort_order
  nextReward: { level, code, title, description } | null,
}
```

Reads `xp_profiles` (all rows for the user in one round trip), `xp_levels`, `xp_rewards`, `goal_categories` under the owner RLS policies using the request-scoped client, **not** the admin client. Read-only: there are no XP write endpoints, because XP is derived state.

Errors: `401 authentication_required`, `500 xp_profile_unavailable`.

### 7.4 XP UI

- **New `src/components/xp/xp-level-badge.tsx`** — a header pill showing `Lv N · X XP` with `"{xpToNextLevel} XP to Lv {N+1}"` or `"Top level unlocked"` beneath. Failures are swallowed; XP display must never block shell rendering. Extracted into its own component so [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx) stays a layout file (the stale branch inlined it).
- **Refetch on completion.** The badge listens for a `window` custom event dispatched by the completion toggle, so marking a goal complete updates the bar without navigation. This closes the old open follow-up "improve XP refresh timing so same-view completions update the global XP bar immediately," which the stale branch left broken.
- **[`src/features/insights/insights-tab.tsx`](../src/features/insights/insights-tab.tsx)** gains an XP section rendering `tracks[]` as a bar list, reusing `getCategoryBadgeClass` keyed on `category_key`. Reads the same `/api/xp/profile` payload; no new API.

---

### 7.5 Reward unlock UX

- **`POST /api/xp/awards/acknowledge`** — body `{ awardId }`, calls
  `public.acknowledge_user_award_service(p_user_id, p_award_id)`, which sets
  `acknowledged_at = now()` **only** where `user_id = p_user_id and acknowledged_at is null`.
  Idempotent; acknowledging twice is a no-op, not an error. Ownership is checked inside the
  RPC, not by RLS, since the RPC runs as definer.
- `GET /api/xp/profile` gains `pendingAwards: Array<{ awardId, level, trackKey, title, description }>`
  from the partial index above.
- The shell shows a one-time toast per pending award, then acknowledges. If the request
  fails the toast is not re-shown in the same session — a lost announcement is a far better
  failure than a repeating one.
- Insights lists earned awards with unlock dates, and renders `goals.reward_text` on
  achieved goals.

**Exit criteria:** an unlock announces exactly once across refresh, navigation, and a
second device; a reverse/re-earn cycle announces zero additional times.

---

## 8. Delete and archive semantics

| Action | XP effect | Rationale |
|---|---|---|
| Unmark completion | reversed | the credited unit disappears |
| `archived_at` set | **not** reversed | archive means parked/done; credit clamps to the archive date, mirroring `getGoalOutcome` |
| `is_deleted = true` (the UI delete) | **reversed** | keeps soft and hard delete symmetric, and prevents earn-delete-repeat loops accumulating XP against goals no longer visible or auditable |
| Hard `delete from goals` | reversed | referential integrity |

Because recompute is idempotent and stateless, un-deleting (`is_deleted = false`) re-awards exactly the prior amount. The alternative — soft delete preserves XP — is defensible ("they did the work") but leaves ledger rows attributable to goals no user can ever see, which is poor for a public feed. Flipping the decision later is a one-line change in step 1 of §5.6 plus a recompute sweep; no ledger data migration. See §10 Q1.

---

## 9. Test plan

### 9.1 pgTAP — `supabase/tests/database/xp_foundation.test.sql`

Emit `select plan(N)` with N matching exactly — `scripts/run-sql-tests.ts` fails if the `ok` count differs from the plan. Follow the existing preamble and role-switching conventions in `supabase/tests/database/rpc_and_rls.test.sql`.

*Awarding basics* — manual awards exactly 20; `linked_cascade` awards exactly 5; `mark_goal_complete` on a linked chain awards 20 to the source and 5 per cascade target; the ledger row's `track_key` equals the goal's `category_key`.

*Credited-progress semantics (the defect suite)* — a completion before `start_date` awards 0; after `end_date` awards 0; two completions in the same weekly anchored period on a cadence goal award 20 total, not 40; two in adjacent periods award 40; a monthly cadence goal anchored on the 31st buckets Feb 28 correctly; a `deadline_total` goal with `target_count = 3` and 5 completions awards 60, not 100; deleting the earliest of those 5 leaves the total at 60 (row #4 is promoted).

*Idempotency and reversibility* — a second `recompute_goal_xp_service` call writes 0 rows; mark → unmark → mark returns `total_xp` to exactly the pre-cycle value; mark → unmark leaves it at exactly the baseline.

*Achievement lifecycle* — reaching `target_count` awards +100 exactly once; raising `target_count` above the credited count reverses it; lowering it back re-awards it; shrinking `end_date` so credited units fall out of window reverses both unit and achievement XP; a `cadence` goal never receives achievement XP.

*Referential integrity* — hard-deleting a goal leaves `total_xp` at baseline and zero orphan ledger rows; `is_deleted = true` reverses and `false` restores; `archived_at` does not reverse already-credited units; deleting a profile removes both tables' rows and raises nothing (the GUC guard path); changing `category_key` moves the balance (old track → 0, new track → full, global unchanged).

*Levels and RLS* — `xp_level_for_total` at 0/99/100/3200/99999; a non-monotonic `xp_levels` row raises; `authenticated` cannot select another user's `xp_profiles` or `xp_ledger`; `authenticated` cannot insert/update/delete any XP table.

*Invariants (assert as standalone queries at the end)* — `sum(xp_ledger.xp_delta) group by user_id` equals `xp_profiles.total_xp where track_key = 'global'` for every user; and the same per track.

### 9.2 pgTAP + vitest parity harness

`supabase/tests/database/goal_period_key.test.sql` holds a literal fixture table of ~30 `(anchor, interval, reference, expected_period_start)` triples: daily identity; weekly boundaries at day 6/7/8; monthly anchors on the 29th/30th/31st across February in leap and non-leap years; year rollovers.

**The same literal table** is duplicated in `src/lib/goals/periods.parity.test.ts` and asserted against `getAnchoredPeriod(...).periodKey`. Two runtimes, one table of truth. This is the only defense against the SQL mirror in §5.5 drifting from the TypeScript original, and it is cheap.

### 9.3 Other

- `supabase/tests/database/goal_category_taxonomy.test.sql` — seeded keys exist; `'global'` rejected; normalization for exact key, alias, unknown, null, and `'general'`; derivation on insert and on category update; explicit `category_key` wins; FK rejects unknown; `on delete restrict` blocks deleting a referenced category.
- Completion guard assertions (3): future-dated insert raises `future_completion_not_allowed`; today succeeds; a past out-of-window date still succeeds.
- `supabase/tests/database/xp_social_award.test.sql` — the §6.12 contract, which nothing
  covered until now: `award_social_xp_service` rejects an `event_type` outside
  `('challenge_award','season_award')` and rejects `p_xp = 0`; a successful call moves
  `xp_profiles.total_xp` by exactly `p_xp` (the invariant a direct insert would break); a
  repeated call with the same `(user, event_type, source_key)` writes no row and returns
  `null`; two duo members sharing one `source_key` both receive rows; `entry_kind` and
  `track_key` are set by the function regardless of caller; `earned_on` equals the
  **recipient's** local date, asserted with two profiles in different timezones; a negative
  `p_xp` writes a `reversal` row and lowers the total.
- `supabase/tests/database/xp_user_awards.test.sql` — crossing a reward level inserts exactly
  one row; a reverse-then-re-cross inserts none (the `unique` plus `do nothing`); regression
  sets `revoked_at` rather than deleting; `acknowledge_user_award_service` is idempotent and
  refuses another user's award; `authenticated` cannot `update` the table directly.
- `pnpm test:concurrency` — a goal recompute and a social award for the **same user**,
  committed concurrently, must leave `total_xp` equal to `sum(xp_delta)`. This is the
  lost-update case the `refresh_xp_profile` lock (§6.7) exists to prevent, and it fails
  reliably without that lock, which is what makes it worth having.
- vitest: `src/lib/goals/category.test.ts` (`resolveCategoryKey` casing/alias/fallback),
  `src/app/api/xp/profile/route.test.ts` (401, zero-state, top-level, track ordering,
  `pendingAwards` shape, `no-store`, envelope on DB error),
  `src/app/api/xp/awards/acknowledge/route.test.ts` (401, not-owner 404, idempotent repeat),
  plus updated `Goal` fixtures across `src/lib/goals/*.test.ts` and `src/lib/planner/*.test.ts`.

### 9.4 Acceptance criteria

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:sql` green on every PR.
2. `pnpm types:supabase && git diff --exit-code -- src/lib/supabase/database.types.ts` clean on every migration PR (CI gates this).
3. Every mark/unmark cycle returns `total_xp` to its exact prior value, for every requirement kind.
4. XP is awarded for **zero** non-credited rows: out-of-window, future-dated, over-target, duplicate-in-period.
5. The ledger-sum invariants in §8.1 hold globally and per track, at all times.
6. No goal edit or delete leaves stale achievement XP.
7. Zero orphan ledger rows.
8. Goal creation, bulk CSV import, and group-goal creation continue to work unchanged after each phase.

---

## 10a. Phasing

The social plan has a phasing table; this one was structured only as prose sections, which
made it easy for later additions to land without an owner. Explicitly:

| PR | Migration | Contents | Depends on |
|---|---|---|---|
| **XP-1** | `additive_xp_phase1_goal_category_taxonomy` | `goal_categories`, `goals.category_key`, `normalize_goal_category_key`, derivation trigger, backfill (§4) | — |
| **XP-2** | `additive_xp_phase2_completion_future_date_guard` | `guard_completion_date` trigger on `public.completions` (§5) | — (land before XP-3, §5.3) |
| **XP-3** | `additive_xp_phase3_xp_foundation` | `xp_levels`, `xp_rewards`, `xp_profiles`, `xp_ledger`, `user_awards`, `goals.reward_text`; period/config helpers; `goal_xp_credited_units`; `recompute_goal_xp_service`; `refresh_xp_profile` (with its lock); `award_social_xp_service`; `acknowledge_user_award_service`; `assert_xp_ledger_consistency_service` + drift cron; all four triggers; RLS; backfill (§6, §10) | XP-1, XP-2 |
| **TS-a** | — | category taxonomy UI + CSV adoption (§7.1) | XP-1 |
| **TS-b** | — | `src/lib/api/` extraction — **shared with the social plan, build once** (§7.2) | — |
| **TS-c** | — | `GET /api/xp/profile`, `POST /api/xp/awards/acknowledge`, XP badge, reward toast (§7.3–7.5) | XP-3, TS-b |
| **TS-d** | — | Insights per-category breakdown (§7.4) | TS-c |

`XP-1` and `XP-2` are independent of each other and of the social plan entirely. **`XP-3` is
the only hard gate for the social feed** (S-3), so it is the critical path item if social
work is running in parallel.

---

## 11. Risks

**R1 — SQL/TS period-logic drift.** `private.goal_period_key` must stay bit-identical to [`src/lib/goals/periods.ts`](../src/lib/goals/periods.ts), especially monthly day-clamping. Mitigated by the shared-fixture parity harness (§8.2). Highest-probability source of a silent wrong-XP bug.

**R2 — Trigger fan-out on group-goal edits.** `goals_xp_recompute` loops over every completing user, so a `target_count` edit on a group goal is O(participants × completions). Bounded by the nine-column change filter and the per-pair advisory lock. If it bites, move the fan-out to a queue table drained by `pg_cron`.

**R3 — `private.local_today_for_timezone` is `volatile`** (`supabase/migrations/20260805060706_planner_local_today_volatile.sql`). Recompute results are therefore date-dependent. §2.5 and §4.1 argue this is safe for the in-scope rules, but **any future time-dependent rule silently reintroduces a cron requirement.** Treat this as a design invariant, not a footnote.

**R4 — Backfill cost.** One transaction over every `(user, goal)` pair. Fine at current scale; see §5.10 for the split.

**R5 — Anti-farming is bounded by credited progress only.** A user can still create 50 trivial goals and complete each once for 1,000 XP. Credited-progress semantics constrain XP *per goal*; they say nothing about goal creation volume. Harmless for a private XP bar, **exploitable on a public leaderboard.** The social plan must add per-day caps or goal-quality signals; this is called out there too.

**R6 — `is_deleted` reversal may read as XP loss** to users. §8 has the one-line escape hatch.

**R7 — `goal-form.tsx` is a merge hotspot across both plans.** This plan adds the `category_key` selector to [`src/features/today/goal-form.tsx`](../src/features/today/goal-form.tsx) (§7.1); the social plan adds two per-goal visibility toggles to the same form and the same submit payload. Land the category selector **first** — it changes an existing control, whereas the visibility toggles are purely additive fields, so that ordering produces the smaller conflict. The same applies to [`bulk-goal-form.tsx`](../src/features/today/bulk-goal-form.tsx), where both plans touch the column-alias map.

---

---

## 10. Operational readiness

Adopted from the product draft, which was right that a correct-by-construction design still
needs to prove it is correct in production.

### 10.1 Anomaly telemetry

The obvious approach does not work. `emitTelemetryEvent`
([`src/lib/telemetry/runtime.ts`](../src/lib/telemetry/runtime.ts)) is TypeScript, and
`recompute_goal_xp_service` is invoked by triggers — there is no app-layer caller on the hot
path to emit from. Almost every XP write in this design happens with no request context.

**So anomalies are written to the Postgres log, not to a table.** A `private.xp_anomalies`
table with an insert helper and its own RLS was the first design here; it is more machinery
than the problem needs. These are rare events that a human reads during an investigation, and
Supabase already collects Postgres logs.

```sql
raise warning 'xp_anomaly kind=% user=% detail=%', p_kind, p_user_id, p_detail;
```

Emitted from `private.refresh_xp_profile` and `public.assert_xp_ledger_consistency_service`.
`warning` rather than `log` so the default `log_min_messages` captures it without config
changes, and it is greppable as `xp_anomaly`.

| Kind | Recorded when | Why it matters |
|---|---|---|
| `drift` | `sum(ledger) <> xp_profiles.total_xp` for a `(user, track)` | the §9.4 invariant checked in production, not just in tests. Should be identically zero. This is the detector for a §6.12 violation |
| `negative_total` | `refresh_xp_profile` computes `total_xp < 0` | the `check (total_xp >= 0)` will already have raised; this captures the context the exception cannot |
| `large_delta` | one recompute writes more than 20 ledger rows | catches runaway fan-out (§11 R2) before users notice |

There is deliberately **no per-recompute success event** — recompute runs on every completion
toggle, and logging each one would dwarf the signal. Only anomalies are recorded.

**If querying anomaly history ever becomes routine, that is the signal to add the table** —
not before. The cost of adding it later is one migration; the cost of carrying it unused is
a table, a helper function, an RLS posture, and a retention policy that all have to be
correct for something nobody reads.

### 10.2 The drift check as a scheduled job

The §9.4 ledger-sum invariant is the one assertion worth running continuously, because
every plausible bug in this design surfaces as drift.

```sql
create or replace function public.assert_xp_ledger_consistency_service()
returns integer                       -- number of mismatched (user, track) pairs
language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; r record;
begin
  for r in
    with ledger as (
      select user_id, track_key, sum(xp_delta) as ledger_total
      from public.xp_ledger group by user_id, track_key
    ),
    global_ledger as (
      select user_id, 'global'::text as track_key, sum(xp_delta) as ledger_total
      from public.xp_ledger group by user_id
    ),
    expected as (
      select * from global_ledger
      union all
      select * from ledger where track_key <> 'global'
    )
    select coalesce(e.user_id, p.user_id)   as user_id,
           coalesce(e.track_key, p.track_key) as track_key,
           coalesce(e.ledger_total, 0)      as ledger_total,
           coalesce(p.total_xp, 0)          as profile_total
    from expected e
    full outer join public.xp_profiles p
      on p.user_id = e.user_id and p.track_key = e.track_key
    where coalesce(e.ledger_total, 0) <> coalesce(p.total_xp, 0)
  loop
    v_count := v_count + 1;
    raise warning 'xp_anomaly kind=drift user=% track=% ledger=% profile=% delta=%',
      r.user_id, r.track_key, r.ledger_total, r.profile_total,
      r.ledger_total - r.profile_total;
  end loop;
  return v_count;
end; $$;

select cron.schedule('xp-drift-check-daily', '23 4 * * *', $$
  select public.assert_xp_ledger_consistency_service();
$$);
```

Three properties worth stating explicitly:

- **It does not self-heal.** Recomputing the profile from the ledger would make every
  mismatch disappear on the next run and hide the bug that caused it. The whole value of
  this job is that drift *stays visible* until someone explains it.
- **`'global'` is computed as the sum over all rows**, not as the rows whose `track_key` is
  `'global'` — matching how `refresh_xp_profile` derives it (§6.7). Getting this backwards
  makes the check report drift on every user with category XP.
- **The `full outer join` is load-bearing.** A ledger row with no profile row, and a profile
  row with no ledger rows, are both drift; an inner join silently misses the first case,
  which is exactly the shape a §6.12 violation produces.

Expected steady state is `0`. Alert on any non-zero return.

### 10.3 Rehearsal

Before phase XP-3 merges, rehearse `pnpm supabase:reset` → migrations → `pnpm test:sql`
end to end, and confirm the backfill completes inside a normal migration window against a
production-sized dump. See §11 R4.

---

## 12. Deferred, and open questions

### Deferred (shapes reserved so the follow-up is purely additive)

- **D1 — `GET /api/xp/ledger`** — `?after=<seq>&limit=&trackKey=&from=&to=`, `seq`-cursored. The identity column and indexes exist in phase XP-3, so this ships without a migration.
- **D2 — nightly `pg_cron` reconcile** over recently-touched pairs. Not needed given §2.5 and §4.1; keep as the escape hatch if a time-dependent rule (cadence achievement, streak bonuses) is ever added.

### Decisions taken (reversible before phase XP-3, costly after)

These are **not** open. Each is decided, with the rationale and the cost of reversing. They
are listed separately because the §3 gate asks you to confirm them explicitly, and because a
reader deserves to know which choices were judgement calls rather than forced.

- **D-1 — Soft delete (`is_deleted = true`) reverses XP.** Keeps soft and hard delete
  symmetric and stops earn-delete-repeat loops accumulating XP against goals no user can
  see or audit. The counter-argument ("they did the work") is real. Reversing the decision
  is one line in step 1 of §6.6 plus a recompute sweep; no ledger migration.
- **D-2 — Group goals award achievement XP to every participant who reaches the target.**
  Credit is per-user throughout this design, so per-user achievement is the consistent
  choice. Excluding them is a one-line filter in §6.6 step 9.
- **D-3 — The seven-category taxonomy** in §4.2, reverse-engineered from `supabase/seed.sql`
  plus the three shipped UI presets. Changing it before launch is an edit to one
  `insert ... values`; changing it after redistributes every user's per-track totals.
- **D-4 — Point values 20 / 25% / 100 and the ten-level curve.** Thresholds are table-driven
  and safe to retune at any time. The three point constants are immutable SQL functions and
  changing them rewrites the meaning of history, so treat them as a one-way door (§2.6).

### Genuinely open


1. **Should `xp_profiles` be publicly readable for leaderboards?** This plan keeps it owner-only and recommends a `SECURITY DEFINER` top-N RPC instead of a widened policy, but it is the social plan's call.
2. **Does a revoked social award (§6.12 with negative `p_xp`) ever need to reach a category track?** Only if the "always global" rule in §6.12 is relaxed. Listed so the coupling is visible if that rule is ever revisited.

---

## Debt avoidance (binding)

The backend cleanup running in parallel is removing, phase by phase, a specific and
repeating set of mistakes. This section names them and binds this plan against repeating
them, because a feature plan that is silent on this is how the next cleanup gets created.

What the cleanup is actually removing, and the pattern behind each:

| Cleanup phase | Removed | Pattern |
|---|---|---|
| 24 (removing 7) | `planner_items` mirror + 5 RPCs | **a denormalized mirror that nothing ended up reading** — built phase 7, dead by phase 24 |
| 15, 16 | coach read / save / move wrapper RPCs | **compatibility wrappers kept after the cutover finished** |
| 13 | `private.*` coach and quota tables | **schema hedging** — build somewhere "safe", move later |
| 21 | rollout fallback shims | **dual-mode code whose second mode outlived its reason** |
| 14, 20, 22 | inert spacing, orphan DB surfaces, vestigial sync plumbing | **speculative plumbing built for a future that did not arrive** |
| 8, 18, 23 | legacy dismiss/move routes, draft-edit bridge, exact-date bridge | **two write paths for one fact** |
| 17 | transition rebuild script | **one-shot scripts committed as permanent files** |
| 12 | dead `one_time` enum label (needed a physical enum rebuild) | **an enum value that outlived its feature** |

### The seven rules

1. **No mirrors.** Derived data is computed at read time unless the copy carries state the
   source genuinely cannot. Any table that does must state, in this document, the property
   that justifies it and the condition under which it should be deleted.
2. **No compatibility aliases.** A rename is finished in the PR that starts it. Re-exporting
   old names "so nothing else changes" is how `src/lib/planner/api.ts` would become the next
   coach-wrapper.
3. **No speculative schema.** No table, column, or enum value ships before the code that
   reads it. In Postgres, `add column` and `alter type ... add value` are cheap; dropping a
   column is a rewrite and dropping an enum label needs the type rebuilt (phase 12 did
   exactly this). **Forward hooks are not free — they are the expensive direction.**
4. **One write path per fact.** If two functions can write the same row, one of them is
   already legacy.
5. **Dual-mode code carries an expiry.** Any fallback branch names, in this document, the
   condition that retires it and the PR that deletes it. A fallback with no named deletion
   is a permanent second implementation.
6. **One-shot scripts are deleted in the PR that runs them**, not committed for reference.
7. **Schema location is decided once.** Nothing lands in `private` "for now."

### Rules 3 and 5 override ordinary extensibility instinct

The usual instinct is to leave room: add the discriminator column now, reserve the enum
value, keep the fallback in case. Every row in the table above is that instinct, six months
later. In a codebase where additive change is cheap and removal is not, **the extensible
choice is to ship the smallest correct schema and extend it when the extension is real.**

Where this plan previously hedged, it has been corrected — see the audit below.

### Audit of this plan

| Surface | Verdict |
|---|---|
| `xp_ledger` | not a mirror. It is the authoritative record of a *decision* (what was credited, when, at what weight); `completions` records the fact, not the credit. Deleting it would lose the ability to reverse correctly |
| `xp_profiles` | derived, and deliberately so. Justified by rule 1: `sum(ledger)` on every page load is not viable, and the §9.4 invariant plus the §10.2 drift job make the copy self-auditing. **Kill condition:** if per-track totals stop being read on hot paths, delete it and compute |
| `user_awards` | not derivable — `acknowledged_at` is state no other table holds |
| `goal_categories` | a real lookup table with FK enforcement, not a hedge |
| `xp_rewards.track_key` | **removed** (§6.2) |
| `src/lib/api/` aliases | **removed** (§7.2) |
| `recompute_goal_xp_service(p_force_zero)` | kept. One caller (the `BEFORE DELETE` trigger), and the alternative is a second near-identical function — rule 4 favours the parameter |
| category taxonomy backfill | runs inside the phase XP-1 migration, not as a committed script (rule 6) |
| `private` schema | used only for pure helpers, never for tables (rule 7) |

**The one deliberate exception is the derivation trigger** in §4.4, which lets phase XP-1
ship without client changes and is therefore a compatibility shim by rule 2. It is kept
because it is not a *rename* — it is the permanent mechanism that keeps `category_key`
correct for any writer, including the bulk importer and future ones. It has no successor to
be superseded by. If the client ever becomes the only writer, it stays anyway, as a
constraint rather than a shim.

---

## 13. Ownership boundary

- **This document owns** XP accrual semantics, the ledger and profile schema, the goal
  category taxonomy, level/reward catalogues, and the reward unlock lifecycle.
- **[`social_consolidated_plan.md`](social_consolidated_plan.md) owns** feed publication,
  challenges, cohorts, leaderboard seasons, admin/moderation, and duo. It consumes the
  ledger read-only and adds two `event_type` values (`challenge_award`, `season_award`)
  that are pre-declared in the §6.4 check constraint so no migration there touches XP.
- **Neither owns** planner cross-month correctness — see
  [`planner_xp_v2_plan.md`](planner_xp_v2_plan.md).

---

## Verification commands

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:sql
```

Types drift gate (CI enforces this):

```bash
pnpm types:supabase && git diff --exit-code -- src/lib/supabase/database.types.ts
```

---

## Critical files

- [`supabase/migrations/20260808154015_additive_phase12_backend_cleanup.sql`](../supabase/migrations/20260808154015_additive_phase12_backend_cleanup.sql) — the rebuilt two-value `goal_frequency_type` enum and the idempotent constraint style every new migration follows
- [`src/lib/goals/admissible.ts`](../src/lib/goals/admissible.ts) — the credited-progress semantics `private.goal_xp_credited_units` must reproduce exactly
- [`src/lib/goals/periods.ts`](../src/lib/goals/periods.ts) — the anchored-period algorithm mirrored in SQL; source of the parity fixtures
- [`src/lib/planner/work-units.ts`](../src/lib/planner/work-units.ts) — canonical `unitKey` vocabulary reused as `source_key`
- [`supabase/migrations/20260805020000_planner_write_mutations.sql`](../supabase/migrations/20260805020000_planner_write_mutations.sql) — the completion write path, the `future_completion_not_allowed` precedent, and the `SECURITY DEFINER` / `search_path = ''` / advisory-lock service-RPC template
- [`src/features/today/bulk-goal-form.tsx`](../src/features/today/bulk-goal-form.tsx) — the highest-risk taxonomy consumer
