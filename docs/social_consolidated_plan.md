# Global Social + Duo — Consolidated Plan

> **Provenance.** This consolidates two independent drafts: a product/process-led plan (`social_global_duo_plan.md`) and an architecture-led plan (`social_duo_plan.md`). The architecture draft is the baseline — it carries the verified schema analysis, the DDL, the `can_view_goal` blast-radius work, and the phasing. From the product draft it absorbs the **four-way privacy granularity** (§3, the most substantive change — the baseline collapsed feed, leaderboard, and challenge participation into one flag), the **staged exposure strategy** (§14), the **pre-XP fallback metric** (§5.6) that decouples launch from the XP long pole, **duo integration into Checklist and Insights** (§8.8) rather than only Social, `duo_preferences` (§8.3a), event-production rate limits (§4.6), and the migration-default open question (§15).

## 1. Context

### The problem

Today "social" in this app is a single 1,464-line client component — [`src/features/social/social-tab.tsx`](../src/features/social/social-tab.tsx) — mounted at `/settings`, doing roughly eight direct PostgREST reads under RLS in one `loadData`. It offers exactly two primitives, both from `supabase/migrations/005_shares_and_participants.sql`:

- `public.goal_shares` — a read-only 1:1 goal share. The recipient can read the owner's completions (via `public.can_view_goal`) but cannot complete (via `public.can_complete_goal`).
- `public.goal_participants` + `goals.is_group` — group goals with **unilateral, non-consensual membership**: the owner inserts a row and the goal immediately appears in the invitee's Checklist and Insights. There is no `status`, no accept, no decline.

There is **no privacy model of any kind**. A repo-wide search for `privacy|visibility|opt_out|is_public|public_profile|discoverab` across `src/` and `supabase/` returns one comment. Every authenticated user is currently discoverable by username substring via `public.find_profile_by_username`. There is no role concept, no `/admin`, no in-app notification surface, no background job runner, and zero social API routes.

Meanwhile [`xp_consolidated_plan.md`](xp_consolidated_plan.md) re-authors XP from scratch with per-category attribution, append-only signed reversal, and credited-progress-aware awarding. That ledger is the first durable, windowed, per-user aggregation source this codebase has ever had — and it is exactly the substrate a feed, challenges, and leaderboard seasons need.

### Intended outcome

Two feature areas, one document, because they share a substrate:

**(A) Global social** — a public activity feed, global challenges (cohort targeting in S-10), seasonal leaderboards with frozen snapshots, an in-app `/admin` backend with a real role concept and moderation primitives, and a profile-level opt-out.

**(B) Duo** — a formalized, mutual, exactly-one-at-a-time 1:1 partnership that supersedes `goal_shares` for the partner case: shared visibility with per-goal exclusion, combined duo XP and duo-unit challenges and leaderboards, nudges and reactions, and a planner proposal/approval flow.

### The load-bearing constraint

**Every goal title in the database was written under an assumption of total privacy.** The single most important design property of this plan is that no existing row's content becomes visible to a stranger as a side effect of a migration. Everything in §3 is downstream of that, and every later section inherits it.

> **Migration phase labels.** These are `social1`–`social10`, deliberately **not** numbers in the
> `additive_phase<N>` series. That counter belongs to the backend cleanup workstream, which
> is advancing several phases per day on its own branches — it reached phase 28 while this
> document was being written. Borrowing it guarantees a collision and communicates nothing,
> since these phases are not part of that series. Ordering still comes from the migration
> timestamp, which is what Supabase actually uses; the label is only a human name.

### Guiding architectural stances

1. The feed is a materialized table, not a query. (§4)
2. Challenges are global in v1; cohort targeting is deferred wholesale rather than stubbed. (§5.2)
3. Challenge metrics are a closed enum with hand-written SQL branches, not a rules DSL. (§5.1)
4. Admin privilege lives outside `profiles`. (§7.1)
5. Cross-user reads go through `SECURITY DEFINER` RPCs, never through widened RLS. (§3.4)
6. A planner proposal never writes to the partner's planner; the owner's own session applies it. (§8.7)

### Branch and numbering

The additive cleanup series has reached **phase 22** (`backend-additive-phase22-remove-sync-scope-plumbing`); the newest phase migration is `20260808183504_additive_phase20_drop_orphan_db_surfaces.sql`. Phases XP-1–XP-3 belong to [`xp_consolidated_plan.md`](xp_consolidated_plan.md). **This document owns phases S-1–S-10.** No re-verification against the cleanup series is needed — see the note below.

---

## 2. Dependency contract on XP

This plan does not build XP. It consumes it. If any item below changes, the named section breaks.

### 2.1 Category taxonomy

`public.goal_categories (key text primary key, label, aliases, color, sort_order)` plus `public.goals.category_key text not null default 'other'` with an FK. **The key is `text`, not a `smallint` id** — self-describing in ledger rows, feed payloads, and challenge configs. `'global'` is a reserved key rejected by a check constraint.

`goals.category` remains free text, because custom category labels are a shipped feature; `category_key` is derived by a `BEFORE INSERT/UPDATE` trigger. *Consumed by:* the default feed line ("Jerry earned 20 XP in **Health**"), `challenge_metric = 'category_xp'`, and category-scoped seasons. Without a constrained key, the feed would leak user-authored strings and category targeting would be unimplementable.

### 2.2 `public.xp_ledger`

Names matter — they appear verbatim in the RPCs below.

| column | notes |
|---|---|
| `id uuid pk` | |
| `seq bigint generated always as identity` | **the only safe pagination cursor**; `created_at` is not safe under concurrency |
| `user_id uuid not null references profiles(id) on delete cascade` | |
| `goal_id uuid references goals(id) on delete cascade` | **nullable** — required for `challenge_award` / `season_award` |
| `completion_id uuid references completions(id) on delete set null` | |
| `track_key text not null` | denormalized category key, or `'global'` |
| `event_type text not null` | `completion_credit`, `goal_achievement` (XP-owned); `challenge_award`, `season_award` (owned here) |
| `entry_kind text not null` | `award` \| `reversal`, with a sign check against `xp_delta` |
| `source_key text not null` | stable identity of the credited unit |
| `xp_delta integer not null` | **signed**; negative for reversals |
| `earned_on date not null` | **owner-local** |
| `created_at timestamptz not null default now()` | |

Required indexes: `(user_id, earned_on desc, seq desc)`, `(track_key, earned_on desc, seq desc)`, `(user_id, goal_id, source_key, track_key)`, and the partial unique `(user_id, event_type, source_key) where goal_id is null`.

### 2.3 Four hard requirements

**(a) Reversal is append-only.** A reversed award is a **new row with negative `xp_delta`**, never a `DELETE` of the original. Load-bearing three times over: the feed decrements a coalesced row rather than rebuilding it (§4.4), challenge progress recomputes correctly from a windowed `sum(xp_delta)` (§5.4), and closed-season snapshots stay defensible (§6.2). *The XP plan's recompute-and-diff design produces this natively — a compensating row is the only thing its diff engine knows how to write — so this costs nothing to preserve and is not a scheduling gate.* If it were ever traded away, the consequence is bounded by the staleness tolerance in §2.3e, not fatal.

**(b) `earned_on` is owner-local, and reversals carry the `earned_on` of the credit they cancel.** All daily feed coalescing and all windowed metrics key on it. If it were UTC, users in UTC−N would have evening activity bucketed into tomorrow; if reversals carried today's date, a late reversal would corrupt the current season instead of the original one.

**(c) The partial unique index on non-goal awards exists.** This is what makes `challenge_award` and `season_award` exactly-once under concurrent refresh (§5.5, §6.5). It replaces a separate `idempotency_key` column.

**(e) Retroactive accuracy is required only while a contest is live.** Challenges and seasons must reflect ledger reversals **while `status = 'active'` / `'open'`** — the 15-minute recompute in §5.4 and §6.5 delivers this. Once a challenge is `closed` or a season is frozen into `leaderboard_season_results`, a later reversal of underlying XP **does not** rewrite the result. This is a deliberate product decision, not an oversight: it is what makes the frozen-results table in §6.2 meaningful, and it removes any need for a retroactive re-scoring job. The same tolerance applies to the feed — a `feed_events` row whose XP was later reversed decrements toward deletion (§4.4) on a best-effort basis, and a stale row is acceptable, not a bug to chase.

**(f) Social never inserts into `public.xp_ledger` directly.** All social XP grants and
revocations go through `public.award_social_xp_service(p_user_id, p_event_type, p_source_key,
p_xp)`, specified in
[`xp_consolidated_plan.md`](xp_consolidated_plan.md) §6.12. That RPC owns `entry_kind`
(derived from the sign of `p_xp`), `track_key` (**always `'global'`** for social awards),
the null `goal_id`/`completion_id`, the conflict handling, and — critically — the
`private.refresh_xp_profile` call.

A raw insert would add a ledger row without moving `xp_profiles.total_xp`, which breaks the
XP plan's §9.4 invariant permanently, freezes level progression, and mis-fires reward
unlocks. This is not a drift *risk*; a direct insert guarantees drift. The RPC returns the
new `seq`, or `null` when the unique index absorbed a retry — **`null` is a success, not an
error**, and it is what makes the 15-minute challenge refresh idempotent.

**Social awards always credit `'global'`, never a category track.** A Health challenge
crediting the `health` track would close a feedback loop — win the challenge, gain Health
XP, rank higher on the Health board, win again. Category tracks measure credited *work*;
prize XP is not work.

**(d) An `AFTER INSERT` trigger on `public.xp_ledger` is permitted.** This plan installs `private.feed_event_from_xp_ledger()` there (§4.4). The XP workstream needs no code changes; the coupling is one-directional.

### 2.4 What this plan does not need

`xp_profiles`, `xp_levels`, and `xp_rewards` are read-only conveniences here. **Leaderboard scores are computed from the ledger window, never from `xp_profiles.total_xp`** — the latter is a lifetime total and cannot be windowed to a season.

### 2.5 What this plan owes XP back

The XP plan's R5 applies here with teeth: credited-progress semantics bound XP *per goal*, not goal creation volume. Fifty trivial goals completed once is still 1,000 XP — harmless for a private XP bar, exploitable on a public leaderboard. §14 carries this as an open risk with the mitigations to consider.

---

## 3. The privacy and visibility model

**Read this section before anything else.** It is the highest-risk part of the plan.

### 3.1 The layers

| Layer | Column | Default | Governs |
|---|---|---|---|
| Discovery | `profiles.social_discoverable` | `true` | whether `find_profile_by_username` returns you, and whether you can be sent a duo invite |
| Feed | `profiles.social_activity_visible` | `true` | whether your activity is **emitted** to the feed at all |
| Ranking | `profiles.social_leaderboard_eligible` | `true` | whether you appear in leaderboard standings |
| Competition | `profiles.social_challenge_eligible` | `true` | whether you can be auto-enrolled in, and ranked within, challenges |
| Goal content | `goals.feed_visibility` | **`private`** | whether your goal *title* may appear in a feed event |
| Partner content | `goals.partner_visibility` | `shared` | whether your active duo partner sees this goal (§8.4) |
| Admin ban | `profiles.leaderboard_banned_at` | `null` | moderator exclusion — **not** a user control (§7.4) |

**Four participation flags, not one.** An earlier draft used a single `social_visibility` enum covering feed, leaderboards, and challenges together. That is the wrong granularity for a real preference people hold: *"I'm happy for my progress to show up, I just don't want to be ranked against strangers."* Collapsing them forces that user all the way out of social, which is both worse product and worse for feed density. Four booleans cost nothing — they are four `where` clauses in four different read paths, which is exactly what §3.5 already needed anyway.

They are also **independent, not hierarchical**. Being invisible in the feed but ranked on a leaderboard is a coherent choice, and so is the reverse. Do not add an implication graph between them.

The asymmetry is deliberate and is the whole safety argument:

- **Users are public by default**, because a feed with an opt-in population is dead on arrival, and the default disclosure is a *derived aggregate* — a category name and an XP number — that the user did not author.
- **Goal titles are private by default, forever**, including for goals created after this ships. A user ticks "show publicly" per goal. The default feed line is *"Jerry earned 20 XP in Health"*; with the toggle on it becomes *"Jerry earned 20 XP — Run 5k three times a week"*.

The backfill sets `feed_visibility = 'private'` with an **explicit `UPDATE`**, not by relying on the column default. A later migration that changes the default must not retroactively alter existing rows' meaning, and an explicit backfill makes the intent auditable in migration history.

### 3.2 Schema

Migration `<ts>_additive_social_phase1_social_visibility.sql`:

```sql
create type public.goal_feed_visibility     as enum ('private','title_public');
create type public.goal_partner_visibility  as enum ('shared','excluded');
-- participation is four independent booleans, not an enum: they are set and read
-- independently, and an enum would force a migration to add a fifth surface.
```

Columns follow the add-nullable → backfill → set-default → set-not-null → guarded-constraint style of `20260808010000_additive_profiles_and_planner_items.sql`:

```sql
alter table public.profiles
  add column if not exists social_discoverable        boolean,
  add column if not exists social_activity_visible    boolean,
  add column if not exists social_leaderboard_eligible boolean,
  add column if not exists social_challenge_eligible  boolean,
  add column if not exists social_visibility_updated_at timestamptz,
  add column if not exists leaderboard_banned_at      timestamptz;

alter table public.goals
  add column if not exists feed_visibility    public.goal_feed_visibility,
  add column if not exists partner_visibility public.goal_partner_visibility;

update public.profiles set social_discoverable         = true where social_discoverable is null;
update public.profiles set social_activity_visible     = true where social_activity_visible is null;
update public.profiles set social_leaderboard_eligible = true where social_leaderboard_eligible is null;
update public.profiles set social_challenge_eligible   = true where social_challenge_eligible is null;
update public.profiles set social_visibility_updated_at = now() where social_visibility_updated_at is null;
update public.goals    set feed_visibility    = 'private' where feed_visibility is null;
update public.goals    set partner_visibility = 'shared'  where partner_visibility is null;
-- then defaults + not null on all four
```

Plus `create index if not exists goals_feed_public_idx on public.goals (id) where feed_visibility = 'title_public';` — a small partial index, since the read path checks this per feed row.

### 3.3 Titles are resolved at read time, never snapshotted

`feed_events` stores `goal_id` (nullable FK, `on delete set null`) and **does not store the title**. The feed read RPC joins `public.goals` and emits a title only when `feed_visibility = 'title_public'` *at read time*.

Denormalizing the title into the feed row would be faster and is wrong:

- Toggling a goal back to private must revoke instantly and completely. With a snapshot you need a scrub job over every historical feed row, and one missed row is a permanent leak.
- Goal titles get edited. A stale snapshot shows text the user believes they changed.
- Soft delete (`goals.is_deleted`) and `archived_at` must also suppress the title.

One join, one predicate, one place to get it right. The cost is a primary-key join for at most 50 rows per page.

### 3.4 Cross-user profile reads go through RPCs — do not widen RLS

`profiles_select_self_or_related` (`supabase/migrations/20260808020000_additive_core_schema_rls_cleanup.sql:12-50`) is deliberately narrow: self, plus profiles owning a goal you can view, plus participants in your goals. The feed needs to render usernames and avatars of complete strangers.

**Do not widen this policy.** It is the only thing between a client and a full dump of `profiles`, which now carries `timezone`, `week_starts_on`, `rest_weekdays`, and `blackout_ranges` — a detailed behavioral profile of when a person is home.

Instead, `public.get_social_feed(...)` is `SECURITY DEFINER` and returns a **denormalized actor projection** (`actor_username`, `actor_display_name`, `actor_avatar_url`) for exactly the actors on the page it returns, and nothing else. Same pattern for leaderboards and challenge participant lists. This generalizes the existing `public.find_profile_by_username` pattern (`20260808020000:52-93`).

`find_profile_by_username` gets a `create or replace` adding `and profile.social_discoverable = true`. This is a behaviour change for anyone who opts out — deliberate. `social_discoverable` also gates who may be sent a duo invite (§8.3), so it is the one flag that affects a non-public surface.

### 3.5 The visibility predicate, stated once

```
feed actor visible        ⟺  profiles.social_activity_visible = true
                          AND  feed_events.hidden_at is null

leaderboard row visible   ⟺  profiles.social_leaderboard_eligible = true
                          AND  profiles.leaderboard_banned_at is null

challenge enrollable      ⟺  profiles.social_challenge_eligible = true
                          AND  profiles.leaderboard_banned_at is null

discoverable / invitable  ⟺  profiles.social_discoverable = true

title is visible  ⟺  goals.feed_visibility = 'title_public'
                 AND  goals.is_deleted = false
                 AND  goals.archived_at is null
```

### 3.6 RLS posture for new tables

| Table | `authenticated` SELECT | `authenticated` write | Read path |
|---|---|---|---|
| `feed_events` | **none** | none | `public.get_social_feed()` DEFINER |
| `feed_reactions` | own rows | insert/delete own | direct + counts via feed RPC |
| `challenges` | audience-aware policy | none | direct PostgREST + detail RPC |
| `challenge_participants` | own rows | none | `public.get_challenge_standings()` DEFINER |
| `leaderboard_seasons` | all rows | none | direct |
| `leaderboard_standings` | **none** | none | `public.get_leaderboard_standings()` DEFINER |
| `leaderboard_season_results` | **none** | none | same RPC |
| `duos` | rows you are a member of | none | direct + DEFINER for partner projection |
| `nudges` | rows where you are sender or recipient | none | direct read, DEFINER write |
| `planner_proposals` | rows in your active duo | none | direct read, DEFINER write |
| `notification_outbox` | own rows | none | DEFINER |
| `admin_users` | **none** | none | `public.is_platform_admin()` DEFINER |
| `moderation_actions` | **none** | none | admin RPC only |
| `partner_profile_fields` | **none** | none | read by `get_partner_profile` as definer; toggled by service role (§8.4a) |
| `duo_preferences` | rows in your own duo | none | direct read; written by duo service RPCs |

"SELECT: none" on `feed_events` and the standings tables is deliberate: their visibility predicate is a multi-way conjunction across three tables plus a moderation flag. Expressing it as an RLS `USING` clause means maintaining it in two places and re-deriving it every time a filter is added. One DEFINER function, one predicate, one pgTAP file.

All writes follow the established convention: `public` tables under RLS, mutations through `*_service` `SECURITY DEFINER` RPCs with `set search_path = ''` and explicit revoke/grant, called from route handlers with `createAdminClient()` ([`src/lib/supabase/admin.ts`](../src/lib/supabase/admin.ts)) via `callAdminRpc` ([`src/lib/supabase/admin-rpc.ts`](../src/lib/supabase/admin-rpc.ts)).

---

## 4. Feed architecture

### 4.1 The decision

**A materialized `public.feed_events` table, written by an `AFTER INSERT` trigger on `public.xp_ledger`, read through a single `SECURITY DEFINER` RPC with keyset pagination. Pull model, no fan-out.**

### 4.2 Why not a live query over the ledger

A live query is superficially attractive — zero new persistence, always consistent. It fails on five counts:

1. **Granularity mismatch.** The ledger has one row per completion; the feed wants one item per person-per-category-per-day. Coalescing at read time is a `group by` over an unbounded table with `LIMIT 50` on the *grouped* output — no index can stop early, so page 1 costs a full window scan.
2. **No stable identity.** Reactions (§8.6) and moderation hides (§7.4) need a foreign-key target. A group-by result has none.
3. **No moderation anchor.** Hiding one item means storing an exclusion keyed on the synthetic group key — at which point you have built `feed_events` anyway, badly.
4. **Privacy filtering cannot be pushed down.** The §3.5 conjunction joins `profiles` and `goals`. Applied after grouping, the planner cannot use it to prune, so a page of 50 visible items may scan thousands of rows belonging to opted-out users.
5. **Event types beyond XP.** `level_up`, `challenge_completed`, `season_result`, `duo_formed` are not ledger rows in any natural sense.

The materialized table costs one trigger and a nightly prune. Good trade.

**This is a denormalized table, so it owes rule 1 an explicit justification.** It is not a
mirror of `xp_ledger`: it is a different grain (one row per person-per-subject-per-day rather
than per credit) and it holds state the ledger cannot — `reaction_count`, `hidden_at`,
`hidden_by`, `occurrence_count`. Reactions and moderation need a stable foreign-key target,
and a `group by` result does not have one. **Kill condition:** if reactions and moderation
were ever removed, `feed_events` should be deleted and the feed served as a windowed query
over the ledger — at that point it *would* be the `planner_items` mistake. Whoever removes
the last of those features owns removing this table.

### 4.3 Table

```sql
create type public.feed_event_type as enum (
  'xp_earned','level_up','goal_achieved',
  'challenge_completed','season_result','duo_formed'
);

create table if not exists public.feed_events (
  id               uuid primary key default gen_random_uuid(),
  actor_id         uuid not null references public.profiles(id) on delete cascade,
  event_type       public.feed_event_type not null,
  subject_key      text not null,          -- coalescing key: category key, challenge id, level
  bucket_date      date not null,          -- owner-local, from xp_ledger.earned_on
  track_key        text,                   -- goal_categories.key when applicable
  goal_id          uuid references public.goals(id) on delete set null,
  xp_delta         integer not null default 0,
  occurrence_count integer not null default 1,
  payload          jsonb not null default '{}'::jsonb,
  reaction_count   integer not null default 0,
  hidden_at        timestamptz,
  hidden_by        uuid references public.profiles(id) on delete set null,
  hidden_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint feed_events_subject_key_len check (char_length(subject_key) between 1 and 120),
  constraint feed_events_payload_object  check (jsonb_typeof(payload) = 'object'),
  constraint feed_events_payload_octets  check (octet_length(payload::text) <= 4096),
  constraint feed_events_counts_positive check (occurrence_count > 0),
  constraint feed_events_hidden_pair     check ((hidden_at is null) = (hidden_by is null))
);

create unique index if not exists feed_events_coalesce_key
  on public.feed_events (actor_id, event_type, subject_key, bucket_date);
create index if not exists feed_events_visible_idx
  on public.feed_events (created_at desc, id desc) where hidden_at is null;
create index if not exists feed_events_actor_idx
  on public.feed_events (actor_id, created_at desc);
```

`challenge_id`, `season_id`, and `duo_id` are **not** in this table at S-3. Each is added by
the phase that first writes it — S-4, S-5, and S-6 respectively — together with its foreign
key, in the same migration. An earlier draft declared all three up front as unconstrained
`uuid` columns with "FK added later" comments; that is three nullable columns nothing reads
for several phases, and an FK that gets forgotten is indistinguishable from one that was
never planned. Adding a nullable column to this table is a metadata-only operation, so there
is nothing to buy by pre-declaring.

Reuse the existing `public.set_updated_at()` trigger function (`supabase/migrations/003_goals.sql:29`).

**Volume** is bounded by `users × active categories × days`. Ten thousand users with three active categories generates ≈30k rows/day worst case, realistically far fewer. With the 90-day prune this stays in the low millions and the covering partial index stays resident.

### 4.4 Write path

```sql
create trigger feed_event_from_xp_ledger
after insert on public.xp_ledger
for each row execute function private.feed_event_from_xp_ledger();
```

1. Skip unless `new.event_type` appears in the emission table below. `challenge_award` and `season_award` are **not** emitted here — their feed events are written by the service RPCs that grant them (§5.5, §6.5), which have the challenge and season context this trigger does not.
2. **Skip if the actor's `social_activity_visible = false` — the row is never written at all.** Opting out is not merely a read filter; it stops emission. Re-opting-in does **not** retroactively backfill; the settings copy must say so.
3. `subject_key := coalesce(new.track_key, 'other')` for `xp_earned`; `goal_achievement` maps to its own event type with `subject_key := goal_id::text`.
4. Upsert on the coalescing key:
   ```sql
   on conflict (actor_id, event_type, subject_key, bucket_date) do update set
     xp_delta         = feed_events.xp_delta + excluded.xp_delta,
     occurrence_count = feed_events.occurrence_count + 1,
     goal_id          = case when feed_events.goal_id is distinct from excluded.goal_id
                             then null else feed_events.goal_id end,
     updated_at       = now()
   ```
   The `goal_id` collapse-to-null matters: if the day's XP in a category came from *two different goals*, no single title represents it, so the row degrades to the category-only form. Prevents mislabelling.
5. **Retraction:** when `new.xp_delta < 0`, apply the negative delta and decrement `occurrence_count`; delete the row when `occurrence_count <= 0` or `xp_delta <= 0`. This is why append-only reversal (§2.3a) is a hard dependency. **Retraction applies to every ledger-sourced event type, including achievements** — see the table below.

#### Emission table — every `feed_event_type`, and exactly what writes it

An earlier draft was self-contradictory here: it said `level_up` was emitted by this trigger
while the step-1 filter excluded it, and it applied `on conflict do nothing` to
`goal_achieved` without saying whether the retraction branch still ran. Both are resolved
below.

| `feed_event_type` | Written by | Coalescing | Retraction on reversal |
|---|---|---|---|
| `xp_earned` | this trigger, on `completion_credit` | `(actor, 'xp_earned', track_key, earned_on)` — accumulates | decrement `xp_delta` and `occurrence_count`; **delete at zero** |
| `goal_achieved` | this trigger, on `goal_achievement` | `(actor, 'goal_achieved', goal_id, earned_on)` — inherently once | `xp_delta` returns to 0 → **delete the row** |
| `level_up` | a **separate social-owned trigger on `public.xp_profiles`**, not this one | `(actor, 'level_up', track_key || ':' || level, date)` — once per level per track | **none** — see below |
| `challenge_completed` | `refresh_challenge_progress_service` (§5.5) | once per `(actor, challenge)` | none — §5.5 |
| `season_result` | `rollover_leaderboard_seasons_service` (§6.5) | once per `(actor, season)` | none — results are frozen (§2.3e) |
| `duo_formed` | `accept_duo_invite_service` (§8.3) | once per `(actor, duo)` | none — dissolution is its own state, not a retraction |

**`goal_achieved` retracts, and that is the correction.** A goal achievement reversal is a
real ledger row (`event_type = 'goal_achievement'`, `xp_delta = -100`), so step 5 fires and
`xp_delta` returns to 0, which deletes the feed row. `on conflict do nothing` governs only
the *insert* — it stops a re-achievement from announcing twice — and does not suppress
retraction. Leaving a stale "achieved their goal" row after the achievement was reversed
would be the one feed inaccuracy users actually notice, because it names a specific goal.

**`level_up` needs a different source, because it is not a ledger event.** Level is derived
from `xp_profiles.current_level`; no ledger row says "you levelled up."

It is emitted by a **second trigger, owned by this plan**, installed in phase S-3:

```sql
create trigger feed_event_from_xp_level
after update on public.xp_profiles
for each row
when (new.current_level > old.current_level)
execute function private.feed_event_from_xp_level();
```

**Why a trigger and not a call inside `private.refresh_xp_profile`.** Putting the
`emit_feed_event` call inside that function would make an XP-owned function depend on a
social-owned one, inverting the one-directional coupling both plans are built on
([`xp_consolidated_plan.md`](xp_consolidated_plan.md) §13) — and worse, it would be silently
lost the next time XP redeployed its own `create or replace` of that function. A trigger
attached to the table survives any redefinition of the function that writes to it, and needs
no coordination between the two workstreams beyond the permission XP grants in §6.12.

The `when` clause means downward level movement emits nothing, matching the no-retraction
rule below. Same `social_activity_visible` gate, applied inside
`private.feed_event_from_xp_level`.

**`level_up` deliberately does not retract.** A level lost to reversal is not worth a
disappearing feed row, and a level regained would then re-announce — the exact re-spam the
`user_awards` unique constraint exists to prevent. This is the §2.3e staleness tolerance
applied consistently: an achievement retracts because it names a goal; a level does not
because it names only a number.

Events not sourced from the ledger are written by their own service RPCs through the shared
`private.emit_feed_event(...)`, which applies the same `social_activity_visible` gate so no
caller can bypass the opt-out.

### 4.5 Read path

```sql
create or replace function public.get_social_feed(
  p_scope     text        default 'global',   -- 'global' | 'duo' | 'actor'
  p_scope_id  uuid        default null,
  p_before_at timestamptz default null,       -- keyset cursor
  p_before_id uuid        default null,
  p_limit     integer     default 30
) returns table (
  id uuid, event_type public.feed_event_type, created_at timestamptz,
  actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text,
  track_key text, category_label text,
  goal_title text,                 -- NULL unless feed_visibility = 'title_public'
  xp_delta integer, occurrence_count integer,
  reaction_count integer, viewer_reacted boolean,
  payload jsonb
) language plpgsql security definer stable set search_path = '';
```

- Auth required (`raise exception using errcode = '28000'` when `auth.uid()` is null), matching `find_profile_by_username`.
- `p_limit` clamped to `[1, 50]`.
- Keyset: `where (created_at, id) < (p_before_at, p_before_id) order by created_at desc, id desc` — hits `feed_events_visible_idx` directly. No `OFFSET`.
- Re-checks `social_activity_visible = true` on the join. Belt and braces: emission handles the forward case, this handles a user who opted out after emission.
- Joins `goals` for the conditional title (§3.3) and `goal_categories` for the label.
- `viewer_reacted` via a lateral `exists` against `feed_reactions`.
- `p_scope = 'duo'` restricts to the two members of the caller's active duo. (`cohort` scope arrives with cohorts in S-10.)
- `p_scope = 'actor'` returns one actor's events, `p_scope_id` being their `profiles.id`. It carries **no special authorization** — it is the global feed filtered to one person, so it applies exactly the same predicate (`social_activity_visible`, `hidden_at is null`, per-goal title gate) and is therefore never a way to see more than the global feed would already show. It returns an empty page for an opted-out or non-existent actor, rather than raising: distinguishing "opted out" from "no activity" would leak the setting itself. The one addition is that a caller viewing **their own** `actor` feed also sees their `hidden_at` rows, flagged as hidden, so moderation is visible to the person moderated.

**Ranking is strictly reverse-chronological in v1.** With a coalesced feed the volume is low enough that chronological *is* the good experience, and any ranking function immediately creates a "why am I not in the feed" support burden with no product upside at this scale. If ranking is ever needed, the shape is a `score numeric` column plus a `(score desc, created_at desc)` index — additive, no redesign.

### 4.6 Emission rate limiting

Coalescing (§4.4) already bounds a normal user to roughly one row per category per day. It
does **not** bound an abusive one: 200 goals completed in a minute across 7 categories is 7
rows but 200 trigger executions and 200 ledger writes.

Two bounds, both inside `private.feed_event_from_xp_ledger`:

- **Per-actor daily cap** — stop emitting new `feed_events` rows for an actor past 50 rows
  in a rolling 24 hours. Ledger accrual is unaffected; only publication stops. A user cannot
  flood the global feed even with a scripted client.
- **Coalescing is the primary defence and should stay that way.** Resist adding event types
  with high natural cardinality (per-completion rows, per-reaction rows) to `feed_events` —
  that is what would make the cap load-bearing rather than a backstop.

This is deliberately *not* a general rate limiter. The XP farming vector (§14) is a
different problem with a different answer, and conflating them produces a limiter that
punishes legitimately productive users.

### 4.7 Retention

```sql
select cron.schedule('prune-feed-events-daily', '17 3 * * *', $$
  delete from public.feed_events where created_at < now() - interval '90 days';
$$);
```

---

## 5. Challenges

### 5.1 Metric expression without a rules engine

This is the design question that decides whether challenges stay maintainable.

**Decision: a closed `public.challenge_metric` enum, with exactly one hand-written SQL branch per value inside one function.** No JSON rule DSL, no expression evaluator, no user-authored predicates.

```sql
create type public.challenge_metric as enum (
  'total_xp',             -- sum(xp_delta) over the window
  'category_xp',          -- same, filtered to challenge.metric_track_key
  'completions_count',    -- count of event_type = 'completion_credit' awards
  'distinct_active_days', -- count(distinct earned_on)
  'max_streak_days'       -- longest run of consecutive earned_on in the window
);
```

Five values cover total XP, category XP, completion counts, streaks, and consistency. Adding a sixth is one enum value, one `when` branch, one pgTAP case — a ~30-line diff with a test, which is cheaper and safer than any generic evaluator, and it means `EXPLAIN` output for every metric is inspectable at review time.

```sql
create or replace function private.challenge_progress_value(
  p_metric        public.challenge_metric,
  p_track_key     text,
  p_user_ids      uuid[],          -- one element for individual, two for duo
  p_from          date,
  p_to            date
) returns numeric language sql stable set search_path = '';
```

Note `p_user_ids uuid[]`: **duo progress is the same function with two ids.** No parallel duo code path. This is the single reason duo challenges and duo leaderboards cost almost nothing (§8.5, §6.4). Windows are expressed on `earned_on` (§2.3b), never `created_at`.

### 5.2 Audience targeting — global only in v1

**Challenges are global in v1. Cohorts are deferred to S-10 in their entirety** — no
`cohorts` table, no `cohort_members`, no `cohort_kind` enum, no join codes, no
`challenges.audience_kind`, no `leaderboard_seasons.scope`, and no `p_scope = 'cohort'` on
the feed.

You asked for group-targeted challenges and this does not drop that; it sequences it. The
reasoning is that cohorts are a whole subsystem — two tables, a join-code flow with its own
rate limiting and enumeration risk, an admin CRUD screen, and a membership-resolution
predicate threaded through challenges, seasons, and the feed — in service of targeting a
group that does not exist yet. Nothing in the product creates a group today, so the first
cohort would be an admin hand-assembling one to test the feature.

Shipping global-only removes that subsystem from the critical path and makes S-4 a
substantially smaller phase. The interesting part of challenges — the metric, the accrual
loop, the award, the standings — is identical either way.

**What S-10 adds when cohorts arrive:** the two tables, `challenges.audience_kind` +
`cohort_id`, `leaderboard_seasons.scope` + `cohort_id`, the feed's `cohort` scope, and the
admin screen. Every one of those is an additive `add column` / `add value` / new table, which
is the cheap direction (see *Debt avoidance* rule 3). The one design property worth
preserving now, because retrofitting it is not cheap, is that **all audience resolution must
go through a single membership lookup** rather than being re-derived per consumer — so when
`cohort_members` lands, challenges, seasons, and the feed each gain one join and nothing else
changes.

### 5.3 Challenges

```sql
create type public.challenge_status     as enum ('draft','scheduled','active','closed','archived');
create type public.challenge_enrollment as enum ('auto','opt_in');
create type public.social_subject_kind  as enum ('user','duo');

create table if not exists public.challenges (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  description      text,
  status           public.challenge_status not null default 'draft',
  enrollment       public.challenge_enrollment not null default 'opt_in',
  subject_kind     public.social_subject_kind not null default 'user',
  metric           public.challenge_metric not null,
  metric_track_key text references public.goal_categories(key) on update cascade,
  target_value     numeric not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  reward_xp        integer not null default 0,
  max_participants integer,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint challenges_window          check (ends_at > starts_at),
  constraint challenges_target_positive check (target_value > 0),
  constraint challenges_reward_nonneg   check (reward_xp >= 0),
  constraint challenges_track_required  check (metric <> 'category_xp' or metric_track_key is not null),
  constraint challenges_slug_format     check (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);
create index if not exists challenges_active_idx
  on public.challenges (status, ends_at) where status = 'active';

create table if not exists public.challenge_participants (
  challenge_id   uuid not null references public.challenges(id) on delete cascade,
  subject_kind   public.social_subject_kind not null,
  subject_id     uuid not null,          -- profiles.id or duos.id, discriminated by subject_kind
  joined_at      timestamptz not null default now(),
  progress_value numeric not null default 0,
  progress_at    timestamptz,
  completed_at   timestamptz,
  awarded_at     timestamptz,
  primary key (challenge_id, subject_kind, subject_id)
);
create index if not exists challenge_participants_subject_idx
  on public.challenge_participants (subject_kind, subject_id);
create index if not exists challenge_participants_progress_idx
  on public.challenge_participants (challenge_id, progress_value desc);
```

`subject_id` is intentionally **not** a foreign key — it polymorphically references `profiles` or `duos`. A trigger `private.validate_challenge_participant()` enforces referential integrity per `subject_kind`, mirroring the existing `public.validate_goal_participant` trigger (`supabase/migrations/005_shares_and_participants.sql:24-56`). Two nullable FK columns with a check constraint was rejected because it doubles every join in the standings query.

**Enrollment:** `opt_in` writes a participant row on join. `auto` materializes rows for the whole audience on the `scheduled → active` transition, bounded by `max_participants`. In v1 the audience is always "everyone with `social_challenge_eligible = true`".

### 5.4 Progress accrual — recompute on two clocks

**Rejected: bumping `progress_value` from the `xp_ledger` insert trigger.** One completion would fan out to every active challenge the user is enrolled in, turning a single-row insert into unbounded write amplification on `public.mark_goal_complete` — the hottest path in the app — and every reversal would need a perfectly symmetric decrement.

**Chosen:**

1. **Background:** `pg_cron` every 15 minutes calls `public.refresh_challenge_progress_service()` in-DB. It takes an advisory lock, iterates active challenges, and sets `progress_value = private.challenge_progress_value(...)` per participant in batches. The §2.2 ledger indexes make each evaluation an index range scan.
2. **On-demand, self-only:** `public.get_challenge_detail(p_challenge_id)` recomputes **only the calling user's own row** before returning, so someone who just completed a goal sees their own number move immediately. Others are up to 15 minutes stale, which is invisible in a leaderboard-style UI.

This is self-healing: after any ledger reversal the next refresh corrects the value with no compensating logic.

### 5.5 Completion and award

Inside `refresh_challenge_progress_service`, when `progress_value >= target_value` and `completed_at is null`:

1. Set `completed_at = now()`.
2. If `reward_xp > 0`, call `public.award_social_xp_service(member_id, 'challenge_award', 'challenge:' || challenge_id || ':' || subject_kind || ':' || subject_id, reward_xp)` once per member — one call for `subject_kind = 'user'`, two for `'duo'`. **Duo members share the same `source_key`**; the unique index is `(user_id, event_type, source_key)`, so they already differ by `user_id`, and making the key member-specific would make it non-deterministic and defeat idempotency on re-run. Duo challenges pay each member in full — halving reads as punitive. Never insert into `xp_ledger` directly (§2.3f).
3. Set `awarded_at = now()`.
4. Emit a `challenge_completed` feed event via `private.emit_feed_event`.
5. Enqueue a notification (§9).

The same cron transitions `active → closed` when `ends_at <= now()`, after a final
progress refresh.

**Completion is monotonic; awards are never revoked mid-challenge.** If a ledger reversal
drops `progress_value` back below `target_value` on a challenge that is still `active`:

- `completed_at` and `awarded_at` are **left set**, and
- the granted `challenge_award` XP is **not** clawed back.

Two reasons. Telling someone they completed a challenge and then silently un-completing it
is a worse experience than a slightly generous edge case, and it is the same principle
§2.3e already applies to closed seasons. And structurally, the partial unique index means a
re-crossing cannot double-award, so the only thing revocation would buy is the ability to
take something back — which is precisely what we don't want.

`award_social_xp_service` accepts a negative `p_xp` for the case where an award must be
undone (an admin voiding a challenge, §7.3). That is an explicit, audited action, never an
automatic consequence of progress recomputation.

---

### 5.6 Launching before XP is ready

The XP ledger is the long pole, and the feed, challenges, and leaderboards all read from
it. That coupling is a real schedule risk, and the product draft was right to break it.

`private.challenge_progress_value` (§5.1) is the only function that touches the ledger.
Give it a fallback branch:

The condition must be **DB-native**. `XP_ENABLED` is an application env var and is invisible to a SQL function, so the branch keys off schema presence instead:

```sql
-- fallback active when:  to_regclass('public.xp_ledger') is null
-- (schema presence, not an app flag — a SQL function cannot read XP_ENABLED)
--   'completions_count'    -> count(*) from public.completions in window
--   'distinct_active_days' -> count(distinct completed_on)
--   'max_streak_days'      -> longest consecutive run of completed_on
--   'total_xp'             -> raises unsupported_metric_without_xp
--   'category_xp'          -> raises unsupported_metric_without_xp
```

Three of the five metrics need only `public.completions`, which has existed since migration
004. So a completion-count challenge and a consistency-streak season can launch with **no
XP dependency at all**.

**Why this is safe rather than a parallel implementation:** the fallback is inside the same
function, behind the same signature, and the three fallback metrics are *definitionally* the
same quantity computed from completions rather than from ledger rows about completions. The
two XP-denominated metrics fail loudly instead of approximating — an approximate XP score
would be far worse than an unavailable one.

**Expiry — this fallback is dual-mode code and rule 5 applies.** It is deleted in the PR
that lands the first XP-denominated season, which is the moment its condition
(`to_regclass('public.xp_ledger') is null`) becomes permanently false. The deletion is a
tracked line item on that PR, not a follow-up: cleanup phase 21 is removing rollout fallback
shims right now for exactly this reason. If XP ships and the branch is still there a phase
later, it has become a permanent second scoring implementation.

**Migration path.** When XP lands, the branch flips and historical seasons are **not**
rescored — they are frozen (§2.3e). A season that ran on `completions_count` stays a
`completions_count` season forever, which is honest: it is what participants were told they
were competing on.

**What this changes about phasing — and what it does not.** The *metrics* in S-4 and S-5 no
longer need XP. **S-3 still hard-depends on XP-3**, because the feed is built on
`after insert on public.xp_ledger` (§4.4), and that trigger cannot be created against a table
that does not exist. An earlier draft of this section overstated the decoupling; this is the
correction.

So the fallback buys two things, not three:

- **If XP is merely late**, S-4 and S-5 can be reordered *ahead* of S-3 — a challenge list and
  a standings page need neither a feed nor a ledger, only `public.completions`. The one
  coupling to sever is `emit_feed_event`, which S-4/S-5 call for `challenge_completed` and
  `season_result`; stub it to a no-op until S-3 lands.
- **If XP slips indefinitely**, the entire duo track — S-1 → S-2 → S-6 → S-9 — ships with
  **zero** XP dependency and is a complete product on its own.

What the fallback does **not** buy is a feed without XP. That is correct rather than
unfortunate: a feed whose only events are "someone completed something" is much weaker than
one denominated in a score, and building a second non-XP feed path to avoid waiting would be
strictly wasted work. See §15.

---

## 6. Leaderboard seasons

### 6.1 Season rows

```sql
create type public.leaderboard_season_status as enum ('upcoming','open','closed');
create type public.leaderboard_rollover      as enum ('none','weekly','monthly','quarterly');

create table if not exists public.leaderboard_seasons (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  subject_kind       public.social_subject_kind not null default 'user',
  metric             public.challenge_metric not null default 'total_xp',
  metric_track_key   text references public.goal_categories(key) on update cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz,                    -- NULL = indefinite
  status             public.leaderboard_season_status not null default 'upcoming',
  rollover           public.leaderboard_rollover not null default 'none',
  closed_at          timestamptz,
  previous_season_id uuid references public.leaderboard_seasons(id) on delete set null,
  next_season_id     uuid references public.leaderboard_seasons(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint leaderboard_seasons_window check (ends_at is null or ends_at > starts_at),
  constraint leaderboard_seasons_track_required
    check (metric <> 'category_xp' or metric_track_key is not null),
  constraint leaderboard_seasons_rollover_needs_end
    check (rollover = 'none' or ends_at is not null)
);

-- exactly one open season per board identity
create unique index if not exists leaderboard_seasons_one_open
  on public.leaderboard_seasons (
    subject_kind, metric, coalesce(metric_track_key, '')
  ) where status = 'open';
```

That last index is what makes "the current season" a well-defined, race-free concept.

### 6.2 Two standings tables, deliberately

```sql
create table if not exists public.leaderboard_standings (      -- live, mutable, cron-refreshed
  season_id    uuid not null references public.leaderboard_seasons(id) on delete cascade,
  subject_kind public.social_subject_kind not null,
  subject_id   uuid not null,
  score        numeric not null default 0,
  tie_break_at timestamptz,
  rank         integer not null,
  refreshed_at timestamptz not null default now(),
  primary key (season_id, subject_kind, subject_id)
);
create index if not exists leaderboard_standings_rank_idx
  on public.leaderboard_standings (season_id, rank);

create table if not exists public.leaderboard_season_results ( -- frozen, append-only
  season_id    uuid not null references public.leaderboard_seasons(id) on delete cascade,
  subject_kind public.social_subject_kind not null,
  subject_id   uuid not null,
  score        numeric not null,
  tie_break_at timestamptz,
  rank         integer not null,
  display_name text not null,   -- denormalized: subject may later delete or go private
  frozen_at    timestamptz not null default now(),
  primary key (season_id, subject_kind, subject_id)
);
```

Two tables rather than one with an `is_final` flag: the live table is churn under a periodic full refresh, and the natural refresh implementation is `delete where season_id = X; insert ...`. If final results shared the table, one buggy refresh would permanently destroy history that can no longer be recomputed — the ledger may have been reversed, users may have gone private, duos may have dissolved. Separation makes that class of bug impossible rather than merely unlikely.

`display_name` is denormalized **only** in the frozen table. This is the one place snapshotting is correct, because a historical result must stay renderable after the user deletes their account or opts out. It stores a display name, never a goal title.

### 6.3 Tie-breaking

Deterministic, three levels, documented in the UI:

1. `score` descending.
2. `tie_break_at` ascending — the `created_at` of the earliest ledger entry within the window that brought this subject to their final score. Reaching a score sooner wins. Computed as a window function in the refresh query.
3. `subject_id` ascending — final deterministic tiebreak so `rank` is stable across refreshes. Not surfaced in the UI.

Ranks use `dense_rank()` over `(score desc, tie_break_at asc, subject_id asc)`.

### 6.4 Duo entries do not share a board with individuals

`subject_kind` is a property of the **season**, not of a row within a season. A duo season is a separate `leaderboard_seasons` row with `subject_kind = 'duo'`.

Mixing a two-person subject into a one-person board is unfair in a way with no defensible fix — halving the duo score and capping it are both arbitrary — and it double-counts each individual's XP, once for themselves and once for their duo. Separate boards, shown as two tabs, is honest and needs zero special-casing: the same refresh function handles both, because `private.challenge_progress_value` already takes a `uuid[]` (§5.1).

Duo standings resolve `p_user_ids` as `array[user_a_id, user_b_id]` from active duos. A dissolved duo drops out of live standings on the next refresh and keeps its frozen results.

### 6.5 Rollover mechanics

```sql
select cron.schedule('rollover-leaderboard-seasons-hourly', '5 * * * *',
  $$ select public.rollover_leaderboard_seasons_service(); $$);
select cron.schedule('refresh-leaderboard-standings', '*/15 * * * *',
  $$ select public.refresh_leaderboard_standings_service(); $$);
select cron.schedule('refresh-challenge-progress', '*/15 * * * *',
  $$ select public.refresh_challenge_progress_service(); $$);
```

**These call `SECURITY DEFINER` functions directly in-DB, not over HTTP.** The existing push dispatch job (`supabase/migrations/20260803160557_schedule_push_dispatch_with_supabase_cron.sql`) goes out over `net.http_post` to a `CRON_SECRET`-guarded route only because it needs the `web-push` Node library. None of this work does. Going direct removes the vault-secret dependency, the HTTP failure mode, and cold-start latency, and it runs inside a transaction so a partial rollover cannot happen.

`public.rollover_leaderboard_seasons_service()`:

1. `pg_advisory_xact_lock(hashtext('leaderboard_rollover'))` — single-flight.
2. Select open seasons with `ends_at is not null and ends_at <= now()` `for update`.
3. Final refresh of live standings for that season.
4. `insert into leaderboard_season_results select ... from leaderboard_standings where season_id = s.id` with `on conflict do nothing` for idempotency.
5. Optional podium award: `public.award_social_xp_service(member_id, 'season_award', 'season:' || season_id || ':' || subject_id, podium_xp)` per member (§2.3f). Never a direct `xp_ledger` insert — the profile refresh lives inside that RPC, and so does `earned_on`, which the RPC derives from the **recipient's** timezone. Do not pass `current_date`: it is the server's date, and for a user west of UTC it lands the award on the wrong local day and potentially in the wrong season.
6. Emit `season_result` feed events for the top N.
7. `update leaderboard_seasons set status = 'closed', closed_at = now()`.
8. If `rollover <> 'none'`, insert the next season (`starts_at = old.ends_at`, `ends_at = old.ends_at + interval`, `status = 'open'`, same scope/metric/subject_kind, slug suffixed) and backlink both directions.
9. Promote any `upcoming` season whose `starts_at <= now()` to `open`, respecting the partial unique index.

Seasons with `ends_at is null` are never closed by the job — the indefinite-board case.

### 6.6 Read path

`public.get_leaderboard_standings(p_season_id uuid, p_limit integer default 50, p_offset integer default 0)` — `SECURITY DEFINER`, returns the page **plus the caller's own row and rank regardless of page** (the "you are #412" strip), joins `profiles` for the actor projection, excludes `leaderboard_banned_at is not null` and `social_leaderboard_eligible = false`, and reads from `leaderboard_season_results` when the season is closed and `leaderboard_standings` otherwise. One function, both cases.

---

## 7. Admin

### 7.1 Role model — `admin_users`, not `profiles.role`

**Recommendation: a separate `public.admin_users` table. Do not put a role column on `profiles`.**

The argument is concrete, not stylistic. `profiles_update_self` is `for update to authenticated using (id = (select auth.uid()))`, and PostgreSQL RLS has **no column-level restriction in a policy**. Any column on `profiles` is writable by its owner through PostgREST, so a `profiles.role` column would be directly self-assignable — `PATCH /rest/v1/profiles?id=eq.me {"role":"admin"}` — unless defended by a per-column trigger, which is a defense you have to remember to write and can never remove. Meanwhile `profiles` is the one table this plan *adds user-editable columns to* — four participation booleans — so that update policy stays and stays broad. Note `leaderboard_banned_at` lives on the same table and is **not** user-editable in intent; since RLS cannot enforce that per-column, it is protected by a `before update` trigger rejecting any change to it from a non-service role. Without that trigger a banned user could simply `PATCH` their own ban away.

```sql
create type public.admin_role as enum ('admin','moderator');

create table if not exists public.admin_users (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  role       public.admin_role not null default 'moderator',
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note       text
);
alter table public.admin_users enable row level security;
-- deliberately ZERO policies for anon/authenticated: invisible and immutable from any client
revoke all on table public.admin_users from anon, authenticated;

-- caller-scoped: the only variant authenticated users may execute
create or replace function public.is_platform_admin(
  p_min_role public.admin_role default 'moderator'
) returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
      and a.revoked_at is null
      and (p_min_role = 'moderator' or a.role = 'admin')
  );
$$;
grant execute on function public.is_platform_admin(public.admin_role) to authenticated;

-- arbitrary-subject variant: service role only, for admin tooling
create or replace function private.is_platform_admin_for(
  p_user_id uuid,
  p_min_role public.admin_role default 'moderator'
) returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = p_user_id and a.revoked_at is null
      and (p_min_role = 'moderator' or a.role = 'admin')
  );
$$;
revoke execute on function private.is_platform_admin_for(uuid, public.admin_role)
  from public, anon, authenticated;
```

**The subject is not a parameter on the public variant.** An earlier draft exposed
`is_platform_admin(p_user_id, p_min_role)` to `authenticated`, which lets any signed-in user
ask whether *any other* user is an admin — an enumeration oracle for exactly the accounts
worth attacking, and it quietly undoes the "`admin_users` is invisible from any client"
property the table's zero-policy design was built for. The public function now always resolves
`auth.uid()`; the arbitrary-subject variant lives in `private` and is service-role only.

Grants are made by SQL migration or the service role only. **There is no in-app "make someone an admin" screen in v1** — deliberate, and it eliminates the entire privilege-escalation surface.

`moderator` can hide feed events and ban from leaderboards; `admin` can additionally CRUD challenges and seasons.

### 7.2 Route gating

```
src/app/(admin)/admin/layout.tsx          -- server component, gate
src/app/(admin)/admin/page.tsx            -- dashboard
src/app/(admin)/admin/challenges/page.tsx
src/app/(admin)/admin/seasons/page.tsx
src/app/(admin)/admin/moderation/page.tsx
```

`(admin)` is a sibling route group to `(app)` under the existing root `src/app/layout.tsx` — the supported way to opt a segment out of a shared layout (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`). `/admin` gets no `AppShell`, no tab bar, no swipe handler. Because the root layout is shared rather than duplicated, navigating between `/social` and `/admin` does not full-reload.

```ts
const supabase = await createClient();           // cookies() is async in Next 16
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
const { data: isAdmin } = await supabase.rpc("is_platform_admin", { p_min_role: "moderator" });
if (!isAdmin) notFound();                        // 404, not 403
```

Three rules:

1. **`notFound()`, not `redirect()` or 403.** Non-admins get an indistinguishable 404 and cannot confirm `/admin` exists.
2. **[`src/proxy.ts`](../src/proxy.ts) is not the gate.** It only refreshes sessions. Adding auth logic there conflates two concerns and is easy to bypass with matcher edge cases. Leave it alone.
3. **Every `/api/admin/*` handler re-checks independently** via `requireAdminContext()` (§10). The layout gate is a UX affordance; the route handler is the security boundary. A layout is not a security boundary.

### 7.3 CRUD surfaces

| Screen | Operations |
|---|---|
| Challenges | list/filter by status; create; edit while `draft`/`scheduled`; publish (`draft → scheduled → active`); force-close; archive; view and remove participants |
| Seasons | list; create; set rollover; **manual close now**; view live standings and frozen results; open the next season manually |
| Moderation | queue of recent feed events with actor and content; hide/unhide with reason; ban/unban from leaderboards; audit log |

**Immutability rule:** a challenge's `metric`, `target_value`, `starts_at`, `subject_kind`, and audience become read-only once `status = 'active'`, enforced by a `before update` trigger. Otherwise progress recomputation retroactively rewrites everyone's standing mid-challenge.

### 7.4 Moderation primitives

Fast flags on the read path, plus an audit log.

**Flags:**
- `feed_events.hidden_at / hidden_by / hidden_reason` — soft hide. `get_social_feed` filters `hidden_at is null`, and `feed_events_visible_idx` is partial on that predicate so hidden rows cost nothing on the hot path.
- `profiles.leaderboard_banned_at` — excluded from `get_leaderboard_standings` and from new `challenge_participants` inserts. Existing frozen results are **not** rewritten; a ban is forward-looking. Retroactive scrubbing of frozen history is a deliberate non-feature.

**Audit log:**

```sql
create type public.moderation_target as enum ('feed_event','user','challenge','duo');
create type public.moderation_action as enum (
  'hide','unhide','ban_leaderboard','unban_leaderboard',
  'remove_participant','close_challenge'
);

create table if not exists public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles(id) on delete set null,
  admin_username text not null,   -- denormalized: audit must outlive the account
  target_kind public.moderation_target not null,
  target_id   uuid not null,
  action      public.moderation_action not null,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint moderation_actions_reason_len check (reason is null or char_length(reason) <= 500)
);
create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_kind, target_id, created_at desc);
```

Every moderation RPC writes both the flag and the audit row in one transaction.

`admin_id` is **nullable** on purpose. `not null` combined with `on delete set null` is a latent failure: the table creates fine, and then the first attempt to delete a profile that ever performed a moderation action raises, because the FK action tries to write `null` into a `not null` column. Deleting an admin must not be blocked by their audit history, and the history must not be deleted with them — so the reference goes null and `admin_username` carries the readable identity forward. This is the same reasoning as `display_name` in `leaderboard_season_results` (§6.2): denormalize exactly where a record has to outlive the row it points at.

**User-facing reporting is deferred** (§14). v1 moderation is admin-initiated over a chronological queue, which is adequate at this scale and avoids building a triage workflow before there is anything to triage.

---

## 8. Duo / partner

### 8.1 The relationship table

One row per relationship, not two rows per pair.

```sql
create type public.duo_status as enum ('pending','active','declined','expired','dissolved');

create table if not exists public.duos (
  id             uuid primary key default gen_random_uuid(),
  user_a_id      uuid not null references public.profiles(id) on delete cascade,
  user_b_id      uuid not null references public.profiles(id) on delete cascade,
  status         public.duo_status not null default 'pending',
  invited_by     uuid not null references public.profiles(id) on delete cascade,
  invite_message text,
  invited_at     timestamptz not null default now(),
  responded_at   timestamptz,
  accepted_at    timestamptz,
  dissolved_at   timestamptz,
  dissolved_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint duos_canonical_order  check (user_a_id < user_b_id),
  constraint duos_distinct         check (user_a_id <> user_b_id),
  constraint duos_inviter_member   check (invited_by in (user_a_id, user_b_id)),
  constraint duos_message_len      check (invite_message is null or char_length(invite_message) <= 280),
  constraint duos_active_has_accept check (status <> 'active' or accepted_at is not null)
);

create unique index if not exists duos_pending_pair
  on public.duos (user_a_id, user_b_id) where status = 'pending';
create index if not exists duos_user_a_idx on public.duos (user_a_id, status);
create index if not exists duos_user_b_idx on public.duos (user_b_id, status);
```

`user_a_id < user_b_id` canonical ordering makes the pair key symmetric, so A-invites-B and B-invites-A collide on `duos_pending_pair` instead of creating crossed invitations.

### 8.2 Exactly one active partner

A partial unique index on `user_a_id where status='active'` plus one on `user_b_id` is **not sufficient** — a user could be `user_a` in one active duo and `user_b` in another. Correct enforcement is a trigger:

```sql
create or replace function private.enforce_single_active_duo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'active' then return new; end if;

  -- deterministic lock ordering prevents deadlock between concurrent accepts
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(least(new.user_a_id, new.user_b_id)::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(greatest(new.user_a_id, new.user_b_id)::text, 0));

  if exists (
    select 1 from public.duos d
    where d.status = 'active' and d.id <> new.id
      and (d.user_a_id in (new.user_a_id, new.user_b_id)
        or d.user_b_id in (new.user_a_id, new.user_b_id))
  ) then
    raise exception using errcode = 'P0001', message = 'duo_already_active';
  end if;
  return new;
end; $$;
-- BEFORE INSERT OR UPDATE ON public.duos FOR EACH ROW
```

This mirrors the existing `validate_goal_participant` trigger and the planner's advisory-lock convention. Locks are taken in sorted-uuid order so two simultaneous accepts involving the same people cannot deadlock. Covered by `pnpm test:concurrency`.

### 8.3 Lifecycle

**Invite** — `public.invite_duo_partner_service(p_inviter, p_invitee, p_message)`. Rejects if either party already has an active duo, if a pending invite exists in either direction, if the invitee has `social_discoverable = false`, or if the inviter is inside the post-dissolution cooldown. Enqueues a notification.

**Accept** — `public.accept_duo_invite_service(p_user, p_duo_id, p_visibility_acknowledged)`.

The acknowledgement flag is the privacy hinge. `goals.partner_visibility` defaults to `'shared'`, so accepting a duo exposes every existing goal — title, completions, heatmap — to the partner. That default is only defensible because acceptance is an explicit mutual act, so the accept flow **must** show a pre-flight screen: *"Alex will be able to see these 14 goals and your completion history. Exclude any now."* The RPC raises `visibility_not_acknowledged` if the flag is false. Both sides see the disclosure — the inviter at invite time, the acceptor at accept time.

On success: `status = 'active'`, `accepted_at = now()`, emit a `duo_formed` feed event for both, notify both.

**Decline / withdraw** — `status = 'declined'`, `responded_at` set.

**Expiry** — daily cron sweeps `status = 'pending' and invited_at < now() - interval '14 days'` → `'expired'`.

**Dissolution** — `public.dissolve_duo_service(p_user, p_duo_id)`. Either member, unilaterally, no confirmation from the other.

- `status = 'dissolved'` with `dissolved_at` / `dissolved_by`. **The row is retained** — frozen season results reference `duos.id` as a `subject_id`.
- Shared visibility revokes **immediately**, because every read predicate requires `status = 'active'`.
- Pending `planner_proposals` are set to `'withdrawn'`.
- Duo XP stops accruing; the duo drops out of live standings on the next refresh; frozen results are kept.
- `goals.partner_visibility` exclusions are **retained**, not reset. A goal marked "never share with a partner" stays excluded when a new duo forms. That is the safe direction of the default.
- **24-hour cooldown** before either party can form a new duo, enforced in both the invite and accept RPCs. Without it, duo leaderboards are gameable by partner-hopping to whoever is performing best that week, and the accountability-partner product idea collapses into scoreboard optimization.

### 8.3a `public.duo_preferences`

Per-partnership, per-user settings. Separate from the four global flags because they answer
a different question — not *"am I in social?"* but *"what do I want from this partner?"*

```sql
create table if not exists public.duo_preferences (
  duo_id             uuid not null references public.duos(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  -- S-6 (this migration):
  share_completions  boolean not null default true,   -- partner sees my completion history
  allow_nudges       boolean not null default true,
  -- S-7 adds: notify_partner_activity boolean not null default true
  -- S-9 adds: share_planner   boolean not null default true   (partner may read my plan, §8.7)
  --           allow_proposals boolean not null default true   (partner may propose changes)
  updated_at         timestamptz not null default now(),
  primary key (duo_id, user_id)
);
```

The row describes what **this user exposes to their partner**, not what they receive. Both
members get a row on accept.

**Columns ship with the phase that enforces them** (rule 3). S-6 creates the table with
`share_completions` and `allow_nudges`, which it enforces. `share_planner` and
`allow_proposals` are added by S-9, the phase that builds the planner surfaces they gate;
`notify_partner_activity` by S-7 with the notification outbox. Creating all five in S-6 would
mean three flags a settings screen exposes and no code honours — a user switching off
"partner may propose planner changes" and having proposals arrive anyway is worse than the
control not existing yet.

Two design points:

- **These are settings, not the enforcement point for goal content.** Per-goal exclusion
  stays on `goals.partner_visibility`. `share_completions = false` is a blunt "pause
  everything" switch; `partner_visibility = 'excluded'` is the surgical one. Keeping them
  separate means a user can hide one goal without signalling anything to their partner, and
  can pause everything without editing 40 goals.
- **Preferences survive dissolution and are reused on re-pair**, matching how
  `goals.partner_visibility` exclusions are retained (§8.3). Rows are keyed by `duo_id`
  though, so a genuinely new partnership starts from defaults. If that proves wrong, the fix
  is to seed a new duo's preferences from the most recent dissolved one.

`allow_proposals = false` is checked by `invite`-time UI and enforced in
`create_planner_proposal_service`, so a partner cannot queue proposals someone has switched
off.

### 8.4 Capability 1 — shared visibility

**Implementation: a new `public.can_view_goal_content`, leaving `public.can_view_goal`
untouched.**

The obvious move is to add a duo branch to `can_view_goal` (current definition:
`supabase/migrations/011_soft_delete_goals.sql:6`, superseding `006_helpers_and_rpc.sql:1`).
That one edit would deliver goals, completions, heatmaps, streaks, photos **and** the
partner's full `profiles` row in a single change — because `profiles_select_self_or_related`
is written in terms of `can_view_goal`.

That last item is not wanted (§8.4a), so the duo branch goes into a **separate predicate**
used by the three content policies only:

```sql
create or replace function public.can_view_goal_content(p_goal_id uuid, p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.can_view_goal(p_goal_id, p_uid)
      or exists (
        select 1
        from public.goals g
        join public.duos d
          on d.status = 'active'
         and ((d.user_a_id = g.owner_id and d.user_b_id = p_uid)
           or (d.user_b_id = g.owner_id and d.user_a_id = p_uid))
        join public.duo_preferences dp
          on dp.duo_id = d.id and dp.user_id = g.owner_id
        where g.id = p_goal_id
          and g.is_deleted = false
          and g.partner_visibility = 'shared'
          and dp.share_completions = true
      );
$$;
```

`goals_select_related_users`, `completions_select_viewable_goal`, and
`goal_photos_select_if_viewable` switch to `can_view_goal_content`.
`profiles_select_self_or_related` keeps calling `can_view_goal`, so duo grants **no** profile
access at all — partner profile data comes only from the projection in §8.4a.

This costs one extra function and three policy edits instead of one. In exchange, the
privacy boundary becomes a thing you can see in the schema rather than a consequence you have
to reason about, and existing `goal_shares` / `goal_participants` behaviour — including the
profile access those already confer — is bit-for-bit unchanged.

The old single-edit approach, for reference, was:

```sql
or (
  g.partner_visibility = 'shared'
  and exists (
    select 1
    from public.duos d
    join public.duo_preferences dp
      on dp.duo_id = d.id and dp.user_id = g.owner_id
    where d.status = 'active'
      and dp.share_completions = true
      and ((d.user_a_id = g.owner_id and d.user_b_id = p_uid)
        or (d.user_b_id = g.owner_id and d.user_a_id = p_uid))
  )
)
```

**This is the single highest-blast-radius change in either document and must be reviewed as such.** `can_view_goal` is referenced by:

- `goals_select_related_users` (`supabase/migrations/007_rls_policies.sql:27`)
- `completions_select_viewable_goal` (`007_rls_policies.sql:52`) — **this is what delivers heatmaps and streaks**
- `profiles_select_self_or_related` (`20260808020000_additive_core_schema_rls_cleanup.sql`) — **deliberately still calls `can_view_goal`, not `can_view_goal_content`**, so duo confers no profile access. This is the split described above
- `goal_photos_select_if_viewable` on `storage.objects` (`007_rls_policies.sql:242`)

That transitive reach is *exactly* the requested "superset of today's `goal_shares`" — one function change delivers goals, completions, heatmaps, streaks, profile, and photos. It also means a bug here is a cross-account data leak in four places at once. It gets its own pgTAP file with explicit negative cases (§12).

**Where each `duo_preferences` flag is enforced.** A preference that is not checked at a
data-access boundary is decorative, so each one has exactly one enforcement point:

| Flag | Enforced in | Effect |
|---|---|---|
| `share_completions` | `public.can_view_goal_content` (§8.4) | joins `duo_preferences` on the **goal owner's** row — the owner controls what they expose. Clearing it revokes goals, completions, heatmaps, streaks, and photos in one step, via the three content policies. It does **not** affect profile data, which is governed separately by §8.4a |
| `share_planner` | the `planner_items` / execution-plan partner read policy (§8.7) | partner can no longer read the plan; existing proposals stay visible to their target |
| `allow_nudges` | `public.send_nudge_service` | raises `nudges_not_allowed`; checked on the **recipient's** row |
| `allow_proposals` | `public.create_planner_proposal_service` | raises `proposals_not_allowed`; checked on the **target owner's** row |
| `notify_partner_activity` | the notification outbox flusher (§9) | suppresses enqueue; never suppresses the underlying state change |

Note the asymmetry: `share_*` flags are read from the **owner's** row (what I expose),
`allow_*` flags from the **recipient's** row (what I accept). Getting that backwards inverts
consent, so the pgTAP file asserts both directions explicitly.

`share_completions = false` is deliberately the blunt instrument and `partner_visibility =
'excluded'` the surgical one — a user can pause everything without editing forty goals, or
hide one goal without signalling anything to their partner.

### 8.4a Partner profile projection — explicit fields, runtime-adjustable

A partner needs a name and an avatar to be a partner. They do not need `timezone`,
`week_starts_on`, `rest_weekdays`, or `blackout_ranges` — which together are a schedule of
when someone is reliably at home, and which landed on `profiles` as *planner preferences*,
with no thought of ever being shared.

So partner profile reads go through one projection, and the exposed set is **data, not code**:

```sql
create table if not exists public.partner_profile_fields (
  field      text primary key,
  is_exposed boolean not null default false,
  updated_at timestamptz not null default now()
);
-- seeded: username, display_name, avatar_url -> true
--         everything else the projection knows about -> false

alter table public.partner_profile_fields enable row level security;
-- no policies: nothing reads this table directly. get_partner_profile reads it as definer,
-- and an admin toggles it through the service role.
revoke all on table public.partner_profile_fields from public, anon, authenticated;
grant select, update on table public.partner_profile_fields to service_role;
```

The table is **not** readable by `authenticated`. Exposing it would leak which fields exist
and which are withheld, which is information about the privacy model rather than about any
user — small, but there is no reason to give it away, and no client needs it: the projection
already returns exactly the permitted keys.

```sql
create or replace function public.get_partner_profile(p_owner uuid)
returns jsonb language plpgsql security definer stable set search_path = '';

revoke execute on function public.get_partner_profile(uuid) from public, anon;
grant  execute on function public.get_partner_profile(uuid) to authenticated;
```

**There is no viewer parameter, deliberately.** The function resolves the viewer from
`auth.uid()` internally. A `p_viewer` argument on a `security definer` function granted to
`authenticated` is spoofable — any signed-in user could pass someone else's id and read
whatever that person's partner is allowed to read. Removing the parameter is both simpler and
structurally safe, and it is the same correction applied to `is_platform_admin` in §7.1.

1. Raise `28000` if `auth.uid()` is null.
2. Return `null` unless the caller and `p_owner` are in an `active` duo.
2. Build the result from an **explicit field mapping in the function body**, including a key
   only when `partner_profile_fields.is_exposed` is true for it.
3. Never `select *`, and never project a column the mapping does not name.

Two properties matter, and they are in tension until you separate them:

- **Toggling an existing field is a data change** — `update partner_profile_fields set
  is_exposed = ... where field = ...`, effective immediately, no deploy, revocable the same
  way. That is the "adaptable at any time" requirement.
- **Exposing a *new* field is a code change**, because the function must learn to project it.
  This is the important half: any column added to `profiles` in future is **default-deny**.
  A purely data-driven `select` over a column allowlist would auto-expose whatever the next
  migration adds, which is precisely how the current transitive leak came to exist without
  anyone deciding on it.

`profiles_select_self_or_related` is **not** widened. The duo panel, partner strip, Insights
comparison, and partner-plan view all read this RPC. It returns `jsonb` rather than a typed
row so that removing a field is not a breaking signature change.

**Migration ordering:** this ships in S-6 *with* the duo tables, not after. A phase that
grants partner visibility and then adds the projection later would leak in between.

**`public.can_complete_goal` is NOT changed.** A partner sees your goals; they cannot complete them. Add a pgTAP assertion pinning this, because the two functions sit adjacent in `006_helpers_and_rpc.sql` and are easy to "fix" symmetrically by mistake.

Per-goal exclusion is the `goals.partner_visibility` toggle (§3.2), surfaced on the goal edit form next to the feed-visibility toggle, and as a bulk "manage what Alex sees" list in the duo panel.

### 8.5 Capability 2 — duo XP and challenges

**Zero new persistence.** Duo XP is `sum(xp_delta)` over both members' ledger rows in the window, evaluated by the same `private.challenge_progress_value(..., p_user_ids uuid[], ...)` used for individuals (§5.1). A duo challenge is `challenges.subject_kind = 'duo'`; a duo leaderboard is `leaderboard_seasons.subject_kind = 'duo'` (§6.4).

- **Partner-vs-partner** needs an audience of exactly two people, so it arrives with cohorts in S-10 (§5.2). It is then a challenge with `subject_kind = 'user'` targeted at a cohort of the two partners — no new mechanism, just the two existing dials.
- **Partner-as-a-unit** is `subject_kind = 'duo'`.

Two existing dials, no new mechanism.

A member of an active duo enrolled in a duo challenge has their XP counted for the pair, and the same XP also counts for them individually elsewhere. That double-counting is intentional and made visible by separate boards (§6.4), not a bug. See §14 Q4.

### 8.6 Capability 3 — nudges and reactions

```sql
create type public.nudge_kind    as enum ('cheer','remind','custom');
create type public.reaction_kind as enum ('cheer','fire','clap','strong');

create table if not exists public.nudges (
  id           uuid primary key default gen_random_uuid(),
  duo_id       uuid not null references public.duos(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id   uuid not null references public.profiles(id) on delete cascade,
  kind         public.nudge_kind not null default 'cheer',
  goal_id      uuid references public.goals(id) on delete set null,
  message      text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint nudges_distinct check (from_user_id <> to_user_id),
  constraint nudges_message_len
    check (message is null or char_length(btrim(message)) between 1 and 140),
  constraint nudges_custom_needs_message check (kind <> 'custom' or message is not null)
);
create index if not exists nudges_recipient_idx on public.nudges (to_user_id, created_at desc);
create index if not exists nudges_rate_idx      on public.nudges (from_user_id, created_at desc);

create table if not exists public.feed_reactions (
  feed_event_id uuid not null references public.feed_events(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reaction      public.reaction_kind not null,
  created_at    timestamptz not null default now(),
  primary key (feed_event_id, user_id, reaction)
);
create index if not exists feed_reactions_user_idx on public.feed_reactions (user_id, created_at desc);
```

`feed_events.reaction_count` is maintained by an `after insert or delete` trigger on `feed_reactions` — the count is read on every feed page, so denormalizing avoids a correlated aggregate per row.

**Rate limits, enforced inside `public.send_nudge_service`:** 5 nudges per sender per rolling 24 hours, and at most 1 per `(from, to, goal_id)` per calendar day. `kind in ('cheer','remind')` ignores `message` entirely — free text is reachable only via `kind = 'custom'`, which is the one path needing moderation attention later.

Reactions are available on any visible feed event, not just a partner's — that is what makes the global feed feel alive. Nudges are duo-only.

### 8.7 Capability 4 — planner partnership

```sql
create type public.planner_proposal_status as enum
  ('pending','accepted','rejected','withdrawn','stale','expired');

create table if not exists public.planner_proposals (
  id                       uuid primary key default gen_random_uuid(),
  duo_id                   uuid not null references public.duos(id) on delete cascade,
  proposer_id              uuid not null references public.profiles(id) on delete cascade,
  target_owner_id          uuid not null references public.profiles(id) on delete cascade,
  scope_month              date not null,
  status                   public.planner_proposal_status not null default 'pending',
  baseline_schedule_digest text not null,
  operations               jsonb not null,
  note                     text,
  created_at               timestamptz not null default now(),
  decided_at               timestamptz,
  applied_digest           text,
  constraint planner_proposals_distinct    check (proposer_id <> target_owner_id),
  constraint planner_proposals_month_first check (extract(day from scope_month) = 1),
  constraint planner_proposals_ops_array   check (jsonb_typeof(operations) = 'array'),
  constraint planner_proposals_ops_bounded check (jsonb_array_length(operations) between 1 and 50),
  constraint planner_proposals_ops_octets  check (octet_length(operations::text) <= 32768),
  constraint planner_proposals_note_len    check (note is null or char_length(note) <= 500)
);
create unique index if not exists planner_proposals_one_pending
  on public.planner_proposals (duo_id, target_owner_id, scope_month) where status = 'pending';
create index if not exists planner_proposals_target_idx
  on public.planner_proposals (target_owner_id, status, created_at desc);
```

**Reading the partner's plan.** Extend the partner read policy on the planner's scheduled-item
table to include the active duo partner. Access is structurally read-only regardless of policy
mistakes, because that table already does
`revoke insert, update, delete ... from authenticated`.

**The partner read policy must re-apply the per-goal exclusion.** A scheduled item carries a
`goal_id`, so a policy that checks only "is an active partner" exposes items for goals the
owner marked `partner_visibility = 'excluded'` — the user hides a goal from their partner and
then sees it appear on the shared plan. The predicate is:

```
active duo partner
AND  duo_preferences.share_planner = true        (owner's row)
AND  exists (select 1 from public.goals g
             where g.id = item.goal_id
               and g.partner_visibility = 'shared'
               and g.is_deleted = false)
```

The same three conditions apply to the partner-plan API (§10) and to any proposal the partner
builds, so a proposal can never reference an excluded goal's unit key. `duo_visibility.test.sql`
asserts the negative case directly: an excluded goal's scheduled items are invisible to the
partner even while the goal's *sibling* items remain visible.

This is the one place where per-goal exclusion has to be restated rather than inherited —
`can_view_goal` governs goals and completions, but planner tables are reached through their
own policy and would otherwise bypass it entirely.

**Operation vocabulary — closed, mirroring existing write RPCs, no free-form policy patching:**

| op | payload | applies via |
|---|---|---|
| `move_item` | `{goalId, unitKey, toDate, toTime?}` | `public.set_planner_schedule` |
| `lock_item` | `{goalId, unitKey, locked}` | `public.set_planner_item_lock` |
| `clear_month` | `{}` | `public.clear_planner_schedule` |

Validated by `private.validate_planner_json` in SQL and by a zod v4 schema in `src/lib/social/duo/planner-proposal.ts`, reusing the shape and vocabulary of `coachConversationProposalSchema` in [`src/lib/planner/coach-conversations.ts`](../src/lib/planner/coach-conversations.ts) so the two proposal concepts read alike.

Coach policy patches are deliberately **out** of the v1 vocabulary: a partner reshaping your planner *policy* rewrites future months you have not looked at, whereas item moves are visible, bounded, and reversible.

**The application model — the key design point.**

`public.set_planner_schedule` derives its owner from `auth.uid()` (`supabase/migrations/20260808011000_additive_planner_write_boundary.sql:39,53`). Rather than fighting that with service-role impersonation, lean into it:

> **A proposal never writes to the partner's planner. The proposal is a durable, reviewable message. When the owner clicks Accept, the write executes in the owner's own authenticated session, through the exact same RPC the owner's own planner UI uses.**

Consequences: no new write path into the planner, and therefore no new way to corrupt it; the existing owner advisory lock, digest staleness check, and cross-plan guards all apply unchanged; and "my partner edited my plan behind my back" is impossible by construction.

`POST /api/social/duo/planner-proposals/[proposalId]/accept`:

1. `requireSocialRouteContext()`; assert `userId === proposal.target_owner_id` and the duo is `active`.
2. Fetch the current digest via `public.get_planner_schedule_digest`. If it differs from `baseline_schedule_digest`, set `status = 'stale'` and return `409 stale_proposal`, reusing the existing `stale_schedule` error semantics and the `PlannerRouteError` envelope.
3. Translate `operations` into the `p_items` payload shape against the owner's current `planner_items`.
4. Call `public.set_planner_schedule` **on `routeContext.supabase`** — the user's session client, not the admin client.
5. Record `status = 'accepted'`, `decided_at`, `applied_digest`, then call `syncPlannerItemsFromActiveExecutionPlan(...)` from [`src/lib/planner/planner-items-runtime-sync.ts`](../src/lib/planner/planner-items-runtime-sync.ts), exactly as `src/app/api/planner/schedule/route.ts` does.
6. Notify the proposer (§9).

Proposals expire after 7 days via a daily cron, and are auto-withdrawn on duo dissolution.

**Mirrored/shared scheduled items are deferred** (§14). They require a co-owned planner entity, and `planner_items` has `unique (goal_id, unit_key)` and `unique (goal_id, scheduled_date)` plus cross-plan guards that assume single ownership. Retrofitting co-ownership is a planner-core change, not a social change, and should not ride along here.

### 8.8 Native integration across existing surfaces

The original ask was duo "at almost a native level across all of the existing app
functionality." Confining it to a Social tab would not deliver that. Concretely, per
surface:

**Checklist (`/`)** — a partner strip above or below the user's own list: partner's name,
today's completion count, and current streak. **Read-only and non-blocking.** Three rules:
it must not shift or delay the user's own list render (fetch it separately and let it pop
in); it must degrade to nothing on error; and it must never show partner items as actionable
rows, because `can_complete_goal` is deliberately unchanged (§8.4) and a tappable row that
rejects the tap is worse than no row. Respects `share_completions`.

**Insights (`/insights`)** — a side-by-side comparison where **both** partners have
`share_completions = true`: completion rate, current and longest streak, and per-category
split for the selected period. Reuses `MonthHeatmap`
([`src/features/insights/month-heatmap.tsx`](../src/features/insights/month-heatmap.tsx))
with the partner's data. Framed as comparison, never as a winner — the competitive framing
lives in challenges and leaderboards, which people opt into.

**Feed (`/social`)** — a partner-priority filter mode. This is `p_scope = 'duo'`, which
§4.5 already supports; the only new work is the toggle. Worth having because the global feed
is strangers by default, and the partner is the one person whose activity is reliably
interesting.

**Goal form** — the `partner_visibility` toggle next to the feed-visibility toggle, plus a
bulk "manage what Alex sees" list in the duo panel.

**Planner** — §8.7.

**What deliberately does not change:** `can_complete_goal`, the planner's own context
assembly (partner data never enters your kernel inputs), and the coach (§8.8).

**A constraint to respect.** The planner excludes group goals from planning context
([`src/lib/planner/context-loader.ts`](../src/lib/planner/context-loader.ts)). Duo is
account-level, not goal-level, so it does not inherit that exclusion — but it is the reason
duo must **not** be modelled as a two-person group goal. Reusing `goals.is_group` for duo
would silently drop every shared goal out of both partners' planners.

### 8.9 Forward look: a coach that reasons about both partners

**Explicitly out of scope. Not planned, not built.** Recorded so the door stays open.

*What it would require:*
- A consent model distinct from viewing consent — seeing your partner's plan is not consent for a model to ingest it and generate advice about you both.
- A joint context assembler producing a bounded two-person payload without doubling token cost or leaking `partner_visibility = 'excluded'` goals into the prompt.
- A quota model attributing AI spend when one turn benefits two people; the current quota surface is single-owner.
- Joint proposals producing *two* `planner_proposals`, each individually acceptable, with defined behavior when one is accepted and the other rejected.
- Audit and deletion semantics — when a duo dissolves, what happens to a conversation containing both people's data.

*What this plan already does not foreclose:*
- `planner_proposals` carries `duo_id` and separates `proposer_id` from `target_owner_id`, so a coach-generated proposal is just another row with a different proposer — no schema change.
- The `operations` vocabulary is versioned jsonb, extensible additively.
- `duos` is a first-class entity with a stable id, so a future `duo_coach_conversations` table has a natural parent.
- `goals.partner_visibility` is a ready-made prompt-inclusion filter.

*What to actively avoid:* do not add a `duo_id` column to `planner_coach_conversations`, and do not let the coach read across users through any path. Keep the coach strictly single-owner until the consent model exists.

---

## 9. Notification integration

### 9.1 The problem with the existing infrastructure

Delivery today is entirely `dispatch-push-notifications-hourly` → `net.http_post` → `POST /api/push/dispatch` ([`src/app/api/push/dispatch/route.ts`](../src/app/api/push/dispatch/route.ts), `CRON_SECRET` bearer at `:50-57`). It reads `notification_schedules` and fires at most once per user per local day.

**It is structurally incapable of delivering a nudge.** Worst-case latency is 59 minutes, and the once-per-day claim via `last_sent_local_date` means a nudge and a daily reminder cannot both fire.

### 9.2 Outbox plus `after()`, with the outbox as the guarantee

`after()` **is** available in this Next version — confirmed at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, importable from `next/server`, valid in Route Handlers. That gives sub-second delivery for the interactive path. The same doc notes it runs within the route's max duration and is not durable, so it cannot be the only path.

```sql
create type public.notification_channel as enum ('push');
create type public.notification_state   as enum ('pending','sent','failed','skipped');
create type public.notification_kind    as enum (
  'duo_invite','duo_accepted','duo_dissolved','nudge','reaction',
  'challenge_joined','challenge_completed','challenge_ending_soon',
  'season_closed','planner_proposal','planner_proposal_decided'
);

create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         public.notification_kind not null,
  channel      public.notification_channel not null default 'push',
  title        text not null,
  body         text not null,
  url          text,
  dedupe_key   text,
  state        public.notification_state not null default 'pending',
  attempts     smallint not null default 0,
  last_error   text,
  available_at timestamptz not null default now(),
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint notification_outbox_title_len check (char_length(title) between 1 and 120),
  constraint notification_outbox_body_len  check (char_length(body)  between 1 and 200)
);
create unique index if not exists notification_outbox_dedupe
  on public.notification_outbox (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (available_at) where state = 'pending';
```

**Flow:**

1. Any social service RPC that should notify inserts an outbox row **in the same transaction as the state change**. Never notify-then-write; never write-then-maybe-notify. The dedupe index makes double-enqueue harmless.
2. The route handler that triggered it calls `after(() => flushNotificationsForUser(userId))` — best-effort immediate delivery, claiming rows with a conditional `update ... set state='sent' where state='pending'`, the same claim pattern the existing dispatch route uses.
3. A `pg_cron` job every 5 minutes sweeps anything `after()` missed, `net.http_post`ing to a new `CRON_SECRET`-guarded `POST /api/push/outbox`. Worst-case latency 5 minutes; typical well under a second.
4. Failures increment `attempts`, set `available_at = now() + attempts * interval '5 minutes'`, and move to `failed` after 5 tries.

**Refactor required:** the `web-push` send loop, VAPID configuration, and expired-subscription cleanup (404/410) currently live inline in `src/app/api/push/dispatch/route.ts`. Extract to `src/lib/push/send.ts` exporting `configureWebPush()` and `sendPushToUser({ admin, userId, payload })`, consumed by both dispatch routes. **Zero behavior change to the existing daily reminder** — that route's schedule-claiming logic stays exactly as it is.

**User controls** live in [`src/features/settings/notification-settings.tsx`](../src/features/settings/notification-settings.tsx): per-`kind` toggles stored as a `profiles.notification_kinds text[]` with a check constraint, matching the existing `rest_weekdays smallint[]` precedent, since the set is small, closed, and always read whole.

**Quiet hours:** the flusher honors `profiles.timezone` and suppresses non-urgent kinds between 22:00 and 07:00 local by pushing `available_at` forward. Cheap, because `timezone` is already `not null` on `profiles`.

---

## 10. API layer

There is currently **no generic, non-planner route helper** — everything useful lives in [`src/lib/planner/api.ts`](../src/lib/planner/api.ts) (`createCorrelationId`:31, `plannerErrorResponse`:35, `parseBoundedJsonBody`:97, `requirePlannerAdminClient`:149, `requirePlannerRouteContext`:161).

**Do not import planner helpers into social routes.** Extract the domain-neutral pieces into `src/lib/api/`, **update every planner route's imports, and delete the old names** — no re-export aliases (rule 2; see [`xp_consolidated_plan.md`](xp_consolidated_plan.md) §7.2, which owns this PR):

```
src/lib/api/errors.ts   -> ApiRouteError, apiErrorResponse, unknownErrorResponse, createCorrelationId
src/lib/api/body.ts     -> parseBoundedJsonBody (moved verbatim)
src/lib/api/context.ts  -> requireAuthenticatedContext, requireServiceClient
src/lib/api/admin.ts    -> requireAdminContext (calls public.is_platform_admin)
src/lib/social/api.ts   -> requireSocialRouteContext, social capability gating
```

**This is the same PR as [`xp_consolidated_plan.md`](xp_consolidated_plan.md) §7.2. Build it once.**

Conventions preserved verbatim: `export const runtime = "nodejs"`, zod v4, `correlationId` on every response, error envelope `{code, message, correlationId, details?}`, success envelope `{schemaVersion: "1", ...}` with `Cache-Control: no-store`. Route `params` is a `Promise` and must be awaited (Next 16 — see `src/app/api/planner/coach/conversations/[conversationId]/route.ts:58-62`).

**Feature flags.** [`src/lib/planner/capabilities.ts`](../src/lib/planner/capabilities.ts) is env-var-only with a single `CALENDAR_ENABLED`. Add a parallel `src/lib/social/capabilities.ts` with `SOCIAL_ENABLED`, `SOCIAL_FEED_ENABLED`, `SOCIAL_CHALLENGES_ENABLED`, `SOCIAL_DUO_ENABLED`, `SOCIAL_ADMIN_ENABLED`, reusing the existing boolean parser. **All default `false`**, so every phase merges dark and is enabled per environment. This is what makes the phasing in §13 genuinely independently mergeable.

**Routes:**

```
GET    /api/social/feed                                   keyset page
POST   /api/social/feed/[eventId]/reactions
DELETE /api/social/feed/[eventId]/reactions
GET    /api/social/profile/privacy
PUT    /api/social/profile/privacy                        the four participation flags
PUT    /api/social/goals/[goalId]/visibility              feed_visibility, partner_visibility

GET    /api/social/challenges                             list (audience-filtered)
GET    /api/social/challenges/[challengeId]               detail + self-progress recompute
POST   /api/social/challenges/[challengeId]/join
DELETE /api/social/challenges/[challengeId]/join

GET    /api/social/leaderboards                           open + recently closed seasons
GET    /api/social/leaderboards/[seasonId]                standings page + self rank

GET    /api/social/duo                                    current duo + pending invites
POST   /api/social/duo/invites                            { username, message }
POST   /api/social/duo/invites/[duoId]/accept             { visibilityAcknowledged }
POST   /api/social/duo/invites/[duoId]/decline
DELETE /api/social/duo                                    dissolve
POST   /api/social/duo/nudges                             + after() flush
GET    /api/social/duo/plan                               partner planner_items for a month
POST   /api/social/duo/planner-proposals
POST   /api/social/duo/planner-proposals/[id]/accept
POST   /api/social/duo/planner-proposals/[id]/reject
DELETE /api/social/duo/planner-proposals/[id]             withdraw

POST   /api/push/outbox                                   CRON_SECRET-guarded

/api/admin/challenges                    GET POST ; /[id] PATCH DELETE
/api/admin/seasons                       GET POST ; /[id] PATCH ; /[id]/close POST
/api/admin/moderation/feed-events/[id]   POST hide/unhide
/api/admin/moderation/users/[id]/ban     POST DELETE
```

---

## 11. Navigation and UI

### 11.1 Kill the dual-edit hazard first

Adding a tab today requires editing [`src/components/navigation/tab-nav.tsx`](../src/components/navigation/tab-nav.tsx) — both the `tabs` array at `:16-18` **and** the literal `grid-cols-3` at `:45` — *and* [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx) `:17` (`tabOrder`), which are silently order-coupled. Fix this before adding anything.

**New `src/components/navigation/tabs.ts`:**

```ts
export const APP_TABS = [
  { href: "/insights", label: "Insights",  icon: BarChart3 },
  { href: "/",         label: "Checklist", icon: ListChecks },
  { href: "/social",   label: "Social",    icon: Users },
  { href: "/settings", label: "Settings",  icon: Settings },
] as const;
export const TAB_ORDER = APP_TABS.map((t) => t.href);
```

Tailwind cannot see dynamically constructed class names, so use an explicit lookup — `const GRID_BY_COUNT = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" }` — keeping the classes statically extractable. `app-shell.tsx` imports `TAB_ORDER` and deletes its local array; `getActiveTabPath` becomes a longest-prefix `find` over `TAB_ORDER` with `/` as fallback.

**Mobile layout at four tabs.** The current tab is a horizontal `flex ... gap-2` with icon and label side by side, which does not fit four items at 375px. Switch to `flex-col gap-0.5` with `text-[11px]` labels on mobile only (`md:flex-row md:gap-2 md:text-sm`), keeping the desktop row layout.

Swipe order becomes `/insights → / → /social → /settings`, so Social sits between Checklist and Settings — discovered by swiping right from the checklist, the natural gesture after completing something.

### 11.2 Decomposing `social-tab.tsx`

The 1,464-line component is moved **before** it is changed. **Phase S-1 is a pure refactor with zero behavior change**, which makes the diff reviewable as a rename and means every later phase touches small files.

```
src/features/social/
  data.ts                          replaces the 8 direct PostgREST calls with /api/social/* fetches
  types.ts

  connections/shares-panel.tsx     moved verbatim: goal_shares in/out
  connections/group-goals-panel.tsx moved verbatim: goal_participants
  connections/user-search.tsx      moved verbatim: find_profile_by_username

  profile/profile-form.tsx         moved verbatim: username / display_name / avatar
  profile/privacy-form.tsx         NEW (S-1): four participation flags

  feed/feed-list.tsx               NEW (S-3): keyset infinite scroll
  feed/feed-event-card.tsx         NEW (S-3)
  feed/reaction-bar.tsx            NEW (S-7)

  challenges/challenge-list.tsx    NEW (S-4)
  challenges/challenge-detail.tsx  NEW (S-4)
  challenges/join-code-form.tsx    NEW (S-4)

  leaderboards/season-tabs.tsx     NEW (S-5): individual | duo
  leaderboards/standings-table.tsx NEW (S-5)

  duo/duo-panel.tsx                NEW (S-6)
  duo/duo-invite-form.tsx          NEW (S-6)
  duo/duo-visibility-preflight.tsx NEW (S-6): the "Alex will see these 14 goals" screen
  duo/nudge-button.tsx             NEW (S-7)
  duo/partner-plan.tsx             NEW (S-9)
  duo/planner-proposal-form.tsx    NEW (S-9)
```

Keep the existing imports it already relies on: `MonthHeatmap` from [`src/features/insights/month-heatmap.tsx`](../src/features/insights/month-heatmap.tsx), `getCategoryLabel` / `getCategorySwatchColor` from [`src/lib/goals/category.ts`](../src/lib/goals/category.ts), `getGoalCompletionPercentage`, `toLocalDateString`.

### 11.3 Page composition

- `src/app/(app)/social/page.tsx` — **new**. Radix `Tabs` (already a dependency): Feed | Challenges | Leaderboards | Duo.
- `src/app/(app)/settings/page.tsx` — currently just `<SocialTab />`. Becomes profile form + privacy form + notification settings + connections.
- `src/features/today/goal-form.tsx` and `src/app/(app)/goals/[id]` — add the two per-goal visibility toggles.
- `src/app/(admin)/admin/**` — §7.2.

### 11.4 Fix the stale client types

[`src/lib/goals/types.ts:63-69`](../src/lib/goals/types.ts) defines `Profile` with five fields and is already missing `timezone`, `week_starts_on`, `rest_weekdays`, `blackout_ranges`, `timezone_confirmed_at`. Phase S-1 replaces the hand-maintained interfaces with aliases over the generated types:

```ts
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Goal    = Database["public"]["Tables"]["goals"]["Row"];
```

Otherwise every new column in this plan silently fails to appear in the client type — and the new visibility fields are exactly the ones you cannot afford to be wrong about. `pnpm types:supabase` is already CI-gated, so this makes the drift impossible rather than merely visible. This also delivers `category_key` to the client for [`xp_consolidated_plan.md`](xp_consolidated_plan.md) §7.1.

---

## 12. Test plan

### pgTAP (`supabase/tests/database/*.test.sql`, `pnpm test:sql`)

The harness requires an exact `plan(N)` count, so each file declares its assertion count precisely.

| File | Coverage |
|---|---|
| `social_visibility_defaults.test.sql` | backfill sets every pre-existing goal to `feed_visibility='private'`; new goal defaults private; all four participation flags default true on a new profile; each flag independently gates only its own surface; `find_profile_by_username` excludes `social_discoverable=false`; `leaderboard_banned_at` cannot be cleared by the banned user |
| `social_feed_emission.test.sql` | ledger insert coalesces same actor/track/day into one row; a second goal in the same track nulls `goal_id`; negative `xp_delta` decrements and deletes at zero; **no row emitted for a private actor** |
| `social_feed_read_privacy.test.sql` | `get_social_feed` omits opted-out actors and hidden rows; returns `goal_title` **only** for `title_public`; returns NULL for soft-deleted or archived goals; keyset paging has no duplicates or gaps |
| `social_profiles_rls_unchanged.test.sql` | **regression guard** — a stranger still cannot select an arbitrary `profiles` row directly, even though the feed shows their username |
| `challenge_metrics.test.sql` | one assertion per `challenge_metric` value, including a two-element `p_user_ids` duo case and a `max_streak_days` gap case |
| `challenge_progress_award.test.sql` | crossing target sets `completed_at`; refresh is idempotent (asserts on the non-goal-award unique index); a ledger reversal drops progress back below target |
| `leaderboard_rollover.test.sql` | `ends_at<=now()` freezes results and opens the next season; `ends_at is null` never closes; the partial unique index rejects a second open season on the same board identity; frozen results survive an actor going private |
| `leaderboard_tiebreak.test.sql` | equal scores rank by `tie_break_at` then `subject_id`; `dense_rank` stable across two consecutive refreshes |
| `admin_privileges.test.sql` | `authenticated` cannot select or insert `admin_users`; **a user cannot escalate via `PATCH profiles`**; `is_platform_admin` respects `revoked_at` and `p_min_role` |
| `duo_lifecycle.test.sql` | canonical ordering; reciprocal invite collides; accept without acknowledgement raises; single-active trigger raises `duo_already_active`; dissolution retains the row |
| **`duo_visibility.test.sql`** | **the critical file.** Partner can select the owner's `goals` and `completions`; **cannot** select the owner's `profiles` row directly (§8.4a); `get_partner_profile` returns only `is_exposed` fields, and returns `null` for a non-partner; flipping a field off takes effect with no deploy; a column absent from the mapping never appears; **cannot** for `partner_visibility='excluded'`; **cannot** after dissolution; **cannot** `can_complete_goal`; a non-partner sees nothing; `goal_shares` behaviour unchanged |
| `planner_proposal_flow.test.sql` | only `target_owner_id` may accept; digest mismatch rejects; one pending per `(duo, target, month)`; dissolution withdraws pending |
| `notification_outbox.test.sql` | dedupe index prevents duplicate enqueue; claim is single-flight under concurrent flush |

### vitest (co-located, `pnpm test`)

- `src/lib/social/capabilities.test.ts` — flag parsing; all default false
- `src/lib/social/feed/cursor.test.ts` — keyset cursor encode/decode, malformed cursor rejected
- `src/lib/social/duo/planner-proposal.test.ts` — zod schema: closed op vocabulary, 50-op cap, 32KB cap, unknown op rejected
- `src/app/api/social/feed/route.test.ts` — 401 unauthenticated, envelope shape, `no-store`, flag-off 503
- `src/app/api/social/duo/planner-proposals/[id]/accept/route.test.ts` — non-target 403, stale digest 409, and **happy path calls `set_planner_schedule` on the session client, not the admin client** (assert on the mock)
- `src/app/api/admin/challenges/route.test.ts` — non-admin 404, admin 200, immutable-field rejection on an active challenge
- `src/components/navigation/tab-nav.test.tsx` — renders 4 tabs, `aria-current` on the active one, grid class matches tab count
- `src/features/social/**` — feed card with title present vs absent; duo preflight goal count

### Playwright (`e2e/`, `pnpm test:e2e`)

Extend `e2e/app.smoke.spec.ts` and `e2e/api.smoke.spec.ts`; add `e2e/social.spec.ts`, `e2e/duo.spec.ts`, `e2e/admin.spec.ts`.

- 4-tab bar renders and is tappable at 375px with no overflow; swipe `/ → /social` works
- Feed loads, paginates, shows a category-only event; toggling a goal to `title_public` makes the title appear on refresh, and toggling back removes it
- Opting out hides you from the feed and from username search
- Two-account duo flow: invite → preflight disclosure → accept → partner's goals visible → exclude a goal → it disappears → dissolve → everything disappears
- Non-admin gets 404 at `/admin`; admin sees the dashboard and can hide a feed event
- Existing `@axe-core/playwright` assertions extended to `/social` and `/admin`

`pnpm test:concurrency` gains a duo-accept race (two simultaneous accepts must produce exactly one active duo) and a challenge-refresh race (concurrent refresh must not double-award).

### Acceptance criteria

1. After migration, **zero** pre-existing goals have `feed_visibility <> 'private'`. Assert with a count query in pgTAP.
2. No client can select a `profiles` row it could not select before this plan, despite the feed rendering strangers' usernames.
3. A partner sees goals, completions, heatmaps, and streaks; a partner cannot complete, edit, or delete anything.
4. Dissolving a duo revokes all visibility within the same transaction.
5. Challenge and season awards are exactly-once under concurrent refresh.
6. Season close freezes standings that remain renderable after the winner opts out or deletes their account.
7. A nudge is delivered in under 5 seconds on the happy path and within 5 minutes if `after()` fails.
8. `/admin` returns 404 for every non-admin, including via direct `/api/admin/*` calls.
9. Every phase merges with its flag off and produces no user-visible change.
10. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:sql && pnpm test:concurrency` green at every phase boundary.

---

## 13. Phasing

Migrations follow `YYYYMMDDHHMMSS_additive_social_phase<N>_<what>.sql`, year 2026, idempotent, continuing from `20260808183504`. The `social` infix is deliberate and is explained in the labelling note in §1 — these phases are **not** part of the backend cleanup series' `additive_phase<N>` numbering. Phases XP-1–XP-3 belong to [`xp_consolidated_plan.md`](xp_consolidated_plan.md).

| PR | Migration / branch | Contents | Depends on |
|---|---|---|---|
| **S-1** | `additive_social_phase1_social_visibility` | visibility enums, columns, explicit backfill; `find_profile_by_username` respects `social_discoverable`; `src/components/navigation/tabs.ts` + 4th tab (empty flagged page); **pure-move** decomposition of `social-tab.tsx`; `Profile`/`Goal` aliased to generated types; `src/lib/api/` extraction (shared with XP §7.2); `src/lib/social/capabilities.ts`; privacy form; per-goal toggles | — |
| **S-2** | `additive_social_phase2_admin_roles` | `admin_users`, `is_platform_admin`, `moderation_actions`; `(admin)` route group + gate + empty dashboard; `requireAdminContext` | S-1 |
| **S-3** | `additive_social_phase3_feed` | `feed_events`, both emission triggers, `emit_feed_event`, `get_social_feed`, prune cron; `/api/social/feed`; feed UI; moderation hide in `/admin` | S-1, S-2, **XP-3** (hard — §5.6) |
| **S-4** | `additive_social_phase4_challenges` | `challenges`, `challenge_participants`, `challenge_progress_value`, refresh cron; challenge UI; admin CRUD | S-3 |
| **S-5** | `additive_social_phase5_leaderboard_seasons` | seasons, live standings, frozen results, refresh + rollover crons; leaderboard UI; admin CRUD | S-4 |
| **S-6** | `additive_social_phase6_duo_core` | `duos`, `duo_preferences` (`share_completions`, `allow_nudges` only), single-active trigger, invite/accept/decline/dissolve RPCs, expiry cron; **`can_view_goal_content` split** (§8.4); `partner_profile_fields` + `get_partner_profile` (§8.4a); duo panel + preflight | S-1 |
| **S-7** | `additive_social_phase7_nudges_reactions` | `nudges`, `feed_reactions`, `notification_outbox`, outbox cron + `/api/push/outbox`; `src/lib/push/send.ts` extraction; `after()` flush; notification prefs | S-3, S-6 |
| **S-8** | `additive_social_phase8_duo_competition` | `subject_kind='duo'` enablement across challenges and seasons; duo standings; duo board tab | S-4, S-5, S-6 |
| **S-9** | `additive_social_phase9_planner_proposals` | `planner_proposals`; `planner_items` partner read policy; proposal API + accept flow; partner plan UI | S-6 |
| **S-10** | `additive_social_phase10_social_hardening` | **cohorts** (`cohorts`, `cohort_members`, join codes, `challenges.audience_kind`, `leaderboard_seasons.scope`, feed `cohort` scope, admin screen — §5.2); moderation queue UI; retention tuning; season podium awards | S-4, S-5, S-6 |

### Critical path

`S-1 → S-2 → S-3 → S-4 → S-5`

That is the global-social spine and it is strictly serial: the feed needs the visibility model and moderation; challenges need the feed's track/metric plumbing; seasons reuse `challenge_metric` and the standings refresh pattern.

### What runs in parallel

- **Phase S-6 (duo core) branches off S-1 and does not touch the feed, challenges, or seasons.** A second developer can build the entire duo relationship, shared visibility, and preflight UI concurrently with S-2 through S-5. This is the largest available parallelism, and the reason duo core is deliberately kept free of XP dependencies.
- **Phase S-9 (planner proposals)** needs only S-6, so it can land before any of S-3 through S-5. **If XP slips, ship S-1 → S-6 → S-9 and you have a complete, shippable duo product with no XP dependency at all.**
- **Phase S-2 (admin)** can start as soon as S-1's `src/lib/api/` extraction lands.
- **Phase S-7** joins the two tracks and is the first PR needing both.

### The one external dependency

Phase S-3 cannot start until `public.xp_ledger` exists with the §2 contract — it reads the ledger and triggers off it. That is a genuine ordering dependency.

It is **not** a design gate. Append-only reversal (§2.3a) falls out of the XP plan's recompute-and-diff engine for free, and the staleness tolerance in §2.3e means that even if reversal semantics changed, the blast radius is a stale feed row or a frozen result that no longer matches current XP — both explicitly accepted. Nothing here needs confirming before phase S-1 merges.

---

## 14. Staged exposure

Phasing (§13) says what to build; this says who sees it. They are independent, and the
`SOCIAL_*` flags exist precisely so they can be.

| Stage | Audience | Gate to advance |
|---|---|---|
| 1 | Nobody — all flags off | phases merged, CI green |
| 2 | Internal accounts: `SOCIAL_ENABLED`, feed **emission** only, no read surface | `feed_events` accumulating with correct coalescing; zero rows for an opted-out test account |
| 3 | Internal accounts: feed read + `/admin` | moderation hide works end to end; `social_feed_read_privacy` assertions pass against real data, not fixtures |
| 4 | All users: feed, opt-out live in settings | opt-out verified to stop emission **and** hide existing rows; support volume acceptable |
| 5 | All users: one low-risk season — a monthly consistency board on `distinct_active_days` | rollover fires cleanly, standings freeze, next season opens |
| 6 | All users: challenges, including one global challenge | award idempotency holds under the 15-minute refresh |
| 7 | Opt-in group of users: duo invitations | `duo_visibility.test.sql` green **and** no cross-account leak observed |
| 8 | All users: duo | — |

Three notes on ordering:

- **Emission precedes reading (stage 2 → 3).** The feed is only interesting with backfilled
  history, and emission bugs are much cheaper to find before anyone is looking.
- **The first season is `distinct_active_days`, not `total_xp`** — it needs no XP (§5.6),
  and it is the metric least sensitive to the farming vector in §14.
- **Duo is last despite being buildable early.** Phase S-6 can be built in parallel from
  phase S-1 (§13), but it carries the cross-account read risk, so it should be exposed only
  after the moderation and privacy surfaces have been exercised by real traffic.

---

## 15. Risks, open questions, deferred

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The duo predicate leaks through one of its consumers (`goals`, `completions`, `storage.objects`) | **Critical** | the split in §8.4 keeps `profiles` out of the blast radius entirely; dedicated `duo_visibility.test.sql` with explicit negative cases per consumer; ship S-6 flagged off and enable for internal accounts first |
| A future column added to `profiles` becomes partner-visible without anyone deciding | **High** | §8.4a is default-deny: the projection names fields explicitly, so a new column is invisible until someone adds it to the mapping *and* flips it on |
| A goal title reaches the feed without `feed_visibility='title_public'` | **Critical** | titles are never stored in `feed_events` (§3.3); resolved at read time behind one predicate in one RPC; covered by `social_feed_read_privacy.test.sql` |
| A user self-grants admin | **Critical** | privilege lives in `admin_users` with zero client policies (§7.1); `admin_privileges.test.sql` asserts the escalation path is closed |
| XP ledger reversal turns out to be destructive | Low | append-only is native to recompute-and-diff (§2.3a); worst case is a stale feed row or a frozen result that no longer matches current XP, both accepted under §2.3e |
| **Trivial-goal XP farming becomes profitable** once a public leaderboard exists (inherited from `xp_consolidated_plan.md` R5) | High | credited-progress semantics bound XP *per goal*, not goal creation volume. Consider a per-day XP cap, a minimum-goal-age requirement before a goal's XP counts toward a season, or excluding goals with `target_count = 1` and a same-day `start_date` from challenge metrics. **Decide before the first public season opens, not after.** |
| Challenge and season refresh crons fall behind as the ledger grows | Medium | §2.2 indexes; crons take advisory locks so overruns queue rather than pile up; surface a `refreshed_at` staleness metric on the admin dashboard |
| `goal-form.tsx` and `bulk-goal-form.tsx` are merge hotspots with the XP plan | Medium | XP adds the `category_key` selector to the same form and submit payload that this plan adds two visibility toggles to. Land XP's selector **first** — it changes an existing control, these are additive fields, so that ordering minimises the conflict. Coordinated in `xp_consolidated_plan.md` R7 |
| Adding a 4th tab breaks mobile layout at 375px | Medium | icon-over-label on mobile (§11.1); Playwright viewport assertion |
| The `social-tab.tsx` decomposition regresses existing share/group behavior | Medium | phase S-1 is a **pure move** — no logic edits in the same PR; review as a rename diff |
| pg_cron job proliferation (6 new jobs) | Low | all in-DB except the outbox sweeper; each is a single function call; document them in one place |
| The feed is empty and demoralizing at launch | Low | product, not technical: seed one global challenge and one open season so `/social` has content on day one |

### Decisions requiring explicit sign-off before launch

Both are deliberate and defensible; neither should be discovered in review.

- ~~A duo partner gains transitive read access to the partner's `profiles` row.~~
  **Redesigned rather than accepted** (§8.4, §8.4a). An earlier draft extended
  `can_view_goal`, which `profiles_select_self_or_related` is written in terms of, so duo
  would have conferred read access to the whole `profiles` row — `timezone`,
  `week_starts_on`, `rest_weekdays`, `blackout_ranges` included. Full-row exposure is not
  what "share my goals with my partner" means, and it is not something a user could scope.
  The duo branch now lives in a separate `can_view_goal_content` predicate used only by the
  three content policies, and partner profile data comes from
  `get_partner_profile` over a runtime-adjustable field allowlist that is
  **default-deny for any column added later**.
- **Challenge awards are never clawed back mid-challenge** (§5.5). If a ledger reversal drops
  a completed participant back below target while the challenge is still active, they keep
  both `completed_at` and the XP. The alternative — silently un-completing something a user
  was congratulated for — is worse product, and the partial unique index already prevents
  double-award on re-crossing. Admin voiding remains available as an explicit audited action.

### Open questions

1. ~~Does the XP plan preserve append-only reversal?~~ **Resolved:** yes, and it is free — see §2.3a. Retroactive accuracy after a contest closes is explicitly not required (§2.3e).
2. ~~Is `xp_ledger.earned_on` owner-local, and do reversals carry the original date?~~ **Resolved:** yes to both (§2.3b). `award_social_xp_service` derives `earned_on` from the recipient's timezone rather than accepting it as a parameter, so a caller cannot pass `current_date` and land an award on the wrong local day ([`xp_consolidated_plan.md`](xp_consolidated_plan.md) §6.12).
3. **Should closing a season grant XP** (`event_type='season_award'`)? Doing so makes season N's outcome affect season N+1's leaderboard — a compounding-advantage dynamic. Recommend badges or rewards over XP; deferred to phase S-10 pending a call.
4. **Duo challenge XP double-count** — a duo member's XP counts for both their individual board and their duo board. Stated as intentional (§8.5); confirm it reads as fair in the UI.
5. **Global feed vs. followed feed** — v1 is a single global chronological feed. At what user count does that stop being interesting? A `following` table is purely additive (`p_scope='following'`), but the threshold should be decided by observation.
6. **Does opting back in backfill?** Currently no (§4.4 step 2). Confirm the settings copy says so.
7. **Cohort join-code entropy** — deferred with cohorts to S-10. When built: 6–10 uppercase alphanumeric with a per-user attempt limit, since a publicly shared code is enumerable.
8. ~~`goal_shares` deprecation~~ **Decided, because "revisit later" is how three
   overlapping sharing mechanisms become permanent.** All three are kept, with a boundary
   stated here so they cannot drift into each other:
   - **`goal_shares`** — one goal, one recipient, read-only, no reciprocity. The right
     primitive for "look at this one thing."
   - **`goal_participants`** — one goal, many people, each tracking their own completions.
     The right primitive for a shared objective.
   - **`duos`** — account-level, mutual, exactly one. The right primitive for a standing
     relationship.

   They are not redundant: each is the *only* one of the three that fits its case. The rule
   that keeps them apart is that **duo must never be expressible as a two-person group goal,
   and a group goal must never confer partner visibility.** Any future feature that would
   blur that boundary is the signal to consolidate, not to add a fourth.

   **Noted, not scoped:** `goal_participants` has **no consent step** — an owner inserts a
   row and the goal appears in the invitee's Checklist. Shipping a consent-based duo
   alongside a non-consent-based group leaves two models of the same idea that will
   eventually want reconciling. It is deliberately **not** pulled into S-6: it is a change
   to an existing shipped surface with live rows, it is not required for duo to be correct,
   and bundling it would widen a phase that already carries the `can_view_goal` risk.
   Re-evaluate it as part of the broader group/social effort, when group semantics are
   being revisited anyway. Recorded here so it is a decision rather than an oversight; the
   likely shape is `goal_participants.status` (`pending` / `active` / `declined`) plus an
   accept step reusing the duo invite UI.
9. **What do existing users see at migration time?** The backfill sets all four participation flags to `true`, so every existing account becomes feed- and leaderboard-eligible the moment stage 4 opens. Two options: (a) ship it, with an in-app disclosure on first visit to `/social` and a prominent settings link — matches the locked "public by default" decision and gives a live feed on day one; (b) a one-time confirmation prompt before an account's first emission, which is more defensible but guarantees a sparse feed and a long tail of users who never answer. **This plan assumes (a)** on the strength of the argument in §3.1 — the default disclosure is a derived aggregate the user did not author, and goal titles stay private regardless. It is nonetheless the decision with the most user-visible blast radius in this document, and it is worth making explicitly rather than by inheriting the default. If there is any jurisdictional exposure, take (b).
10. **Duo cardinality after v1** — one active partner is enforced by trigger (§8.2). Relaxing it later means dropping that trigger and deciding what a multi-partner duo leaderboard entry means; the `duos` row shape does not need to change.
11. **Should `social_challenge_eligible = false` remove existing enrollments,** or only block new ones? This plan blocks new ones and leaves current participation intact until the challenge closes. The alternative silently voids in-flight progress.

### Explicitly deferred

- **Coach reasoning about both partners simultaneously** — §8.8, with the forward-compatibility notes.
- **Mirrored or co-owned scheduled planner items** — §8.7; requires planner-core ownership changes.
- **Cohorts entirely** — deferred to S-10 (§5.2). Member-created cohorts are a further step beyond that.
- **Rule-based and derived cohorts** — a further step beyond cohorts themselves; nothing about them ships before S-10.
- **User-facing content reporting and a triage queue** — v1 moderation is admin-initiated (§7.4).
- **Email notifications** — the outbox `channel` enum has one value; adding `'email'` is additive.
- **Feed ranking and personalization** — chronological only; the `score` column shape is noted in §4.5.
- **Comments on feed events** — reactions only. Comments need a full moderation and abuse story.
- **Block / mute between users** — the four participation flags cover self-protection; directed blocking is a separate model.
- **Groups larger than 2** — `goal_participants` remains the group mechanism; duo is strictly 1:1.
- **Retroactive scrubbing of frozen season results on ban** (§7.4).
- **Realtime feed updates** — pull-to-refresh and the 15-minute refresh cadence are sufficient.

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
| `feed_events` | denormalized, justified under rule 1 in §4.2, with a stated kill condition |
| `leaderboard_standings` | derived and rebuilt each refresh. Justified: recomputing rank for a page of 50 out of an unbounded ledger window is not a read-time operation. **Kill condition:** none — this is a cache with a `refreshed_at`, and it is deleted per season by the refresh itself |
| `leaderboard_season_results` | not derived. It is a *frozen record* that must survive users going private, deleting accounts, and duos dissolving — the ledger can no longer reproduce it. This is the case denormalization is actually for |
| `challenge_participants.progress_value` | derived, recomputed on a schedule, self-healing. Never the source of truth for anything |
| `notification_outbox` | real state (delivery attempts, dedupe), not a copy |
| `feed_event_type.streak_milestone` | **removed** (§4.3) |
| cohorts, `cohort_members`, `cohort_kind`, join codes, `challenges.audience_kind`, `leaderboard_seasons.scope` | **deferred wholesale to S-10** (§5.2) |
| `feed_events.challenge_id` / `season_id` / `duo_id` | **moved** to the phases that write them (§4.3) |
| `duo_preferences` unenforced flags | **moved** to their enforcing phases (§8.3a) |
| pre-XP metric fallback | **expiry named** (§5.6) |
| `src/lib/api/` aliases | **removed** (§10) |
| `goal_shares` / `goal_participants` / `duos` overlap | **decided, not deferred** (§15 Q8). Group-goal consent is explicitly **not** in scope here — recorded as a follow-up for the broader group effort, not scheduled into S-6 |
| `social_visibility` enum | never shipped — replaced by four booleans before any migration was written (§3.1) |

**Two write paths, checked explicitly (rule 4).** `xp_ledger` has exactly two writers,
`recompute_goal_xp_service` and `award_social_xp_service`, and they are disjoint by
`event_type` and by the `goal_id is null` partial index — neither can write the other's rows.
`feed_events` has three writers (two triggers and `emit_feed_event`) which are disjoint by
`event_type`; the emission table in §4.4 is the authority on which writes what, and adding a
fourth writer without adding a row to that table is the failure mode to watch for.

**One-shot work (rule 6).** The `feed_visibility` backfill, the four participation-flag
backfills all run inside their own migrations.
No transition script is committed.

---

## 16. Ownership boundary

- **This document owns** social publication, the privacy/participation model, challenges,
  cohorts, leaderboard seasons, admin and moderation, notifications, and duo.
- **[`xp_consolidated_plan.md`](xp_consolidated_plan.md) owns** the XP accrual semantics,
  the ledger and profile schema, the goal category taxonomy, and the reward unlock
  lifecycle. This plan consumes the ledger **read-only** and writes only the two pre-declared
  `event_type` values (`challenge_award`, `season_award`).
- **Neither owns** planner cross-month correctness — see
  [`planner_xp_v2_plan.md`](planner_xp_v2_plan.md). §8.7 depends on the planner write
  surface, which is actively being reshaped; re-verify it before building that phase.

---

## Verification commands

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:sql && pnpm test:concurrency
```

Types drift gate (CI enforces this):

```bash
pnpm types:supabase && git diff --exit-code -- src/lib/supabase/database.types.ts
```

---

## Critical files

- [`supabase/migrations/20260808020000_additive_core_schema_rls_cleanup.sql`](../supabase/migrations/20260808020000_additive_core_schema_rls_cleanup.sql) — the consolidated RLS baseline (`profiles_select_self_or_related`, `find_profile_by_username`) every privacy decision in §3 extends or deliberately refuses to widen
- [`supabase/migrations/011_soft_delete_goals.sql`](../supabase/migrations/011_soft_delete_goals.sql) — the **current** definition of `public.can_view_goal`, replaced in §8.4, with four transitive RLS consumers
- [`supabase/migrations/007_rls_policies.sql`](../supabase/migrations/007_rls_policies.sql) — those consumers: `goals_select_related_users`, `completions_select_viewable_goal`, `goal_photos_select_if_viewable`
- [`src/features/social/social-tab.tsx`](../src/features/social/social-tab.tsx) — the 1,464-line component decomposed in phase S-1 (§11.2)
- [`src/lib/planner/api.ts`](../src/lib/planner/api.ts) — source of the route conventions extracted into `src/lib/api/` (§10, shared with the XP plan)
- [`src/components/navigation/tab-nav.tsx`](../src/components/navigation/tab-nav.tsx) and [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx) — the two order-coupled tab definitions collapsed into one module (§11.1)
- [`src/app/api/push/dispatch/route.ts`](../src/app/api/push/dispatch/route.ts) — the `web-push` loop and `CRON_SECRET` guard extracted to `src/lib/push/send.ts` and reused by the outbox (§9.2)
- [`xp_consolidated_plan.md`](xp_consolidated_plan.md) — the XP workstream this plan depends on; §2 is the contract against it
