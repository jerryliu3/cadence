# Synthetic Users Admin View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform admins one roster for synthetic users: a SQL view for inspection and field mutations, plus an `/admin/synthetic-users` page with search, filters, and the same mutations.

**Architecture:** Add `public.admin_synthetic_users` as a `security_invoker` join of `synthetic_users` and `profiles` (plus goal counts). INSTEAD OF UPDATE/DELETE triggers mutate main fields and treat DELETE as disable. The existing admin dashboard talks to that view through service-role APIs, matching Challenges/Seasons.

**Tech Stack:** Postgres 15+ (Supabase), Next.js App Router admin APIs, React 19 client manager, pgTAP, Vitest.

## Global Constraints

- Stack this as `stack/synthetic-social-pr4-admin-view` on `stack/synthetic-social-pr3-ops-backfill`.
- Do not hard-delete auth users. DELETE on the view sets `enabled = false`.
- Do not add a per-user create form. Scale with `provision_synthetic_users_service`.
- Keep grants off `anon`/`authenticated`. Only `service_role` (and superuser SQL) can read/write the view.
- Use `CREATE VIEW ... WITH (security_invoker = true)` so the view cannot bypass underlying RLS.
- Reuse `/admin` layout, `requireAdminContext`, and `createAdminClient`.
- Create migration files with `supabase migration new`.

---

### Task 1: Admin SQL view and mutation triggers

**Files:**
- Create: `supabase/migrations/<timestamp>_synthetic_users_admin_view.sql`
- Test: `supabase/tests/database/synthetic_users_admin_view.test.sql`
- Modify: `docs/synthetic_social_ops.md`

**Interfaces:**
- Consumes: `public.synthetic_users`, `public.profiles`, `public.goals`, `public.provision_synthetic_users_service`
- Produces: `public.admin_synthetic_users` view; `private.admin_synthetic_users_instead_of_update()`; `private.admin_synthetic_users_instead_of_delete()`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/database/synthetic_users_admin_view.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

select is(
  public.provision_synthetic_users_service(4, 2),
  4,
  'provisioning creates synthetic users for admin view coverage'
);

select is(
  (select count(*)::integer from public.admin_synthetic_users),
  4,
  'admin view lists every synthetic user'
);

select ok(
  (
    select bool_and(profile.username = roster.username)
    from public.admin_synthetic_users roster
    join public.profiles profile on profile.id = roster.user_id
  ),
  'admin view exposes profile usernames'
);

select ok(
  (
    select bool_and(roster.goal_count = 2)
    from public.admin_synthetic_users roster
  ),
  'admin view reports non-deleted goal counts'
);

update public.admin_synthetic_users
set
  enabled = false,
  persona = 'low',
  daily_budget = 2,
  display_name = 'Admin Renamed',
  social_activity_visible = false
where user_id = (
  select user_id from public.admin_synthetic_users order by username limit 1
);

select is(
  (
    select synthetic.enabled
    from public.synthetic_users synthetic
    join public.admin_synthetic_users roster
      on roster.user_id = synthetic.user_id
    where roster.display_name = 'Admin Renamed'
  ),
  false,
  'updating the admin view writes synthetic_users fields'
);

select is(
  (
    select profile.social_activity_visible
    from public.profiles profile
    where profile.display_name = 'Admin Renamed'
  ),
  false,
  'updating the admin view writes profile fields'
);

delete from public.admin_synthetic_users
where user_id = (
  select user_id from public.admin_synthetic_users order by username offset 1 limit 1
);

select is(
  (
    select count(*)::integer
    from public.synthetic_users
    where enabled = false
  ),
  2,
  'deleting from the admin view disables the user instead of removing the row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $tap$
    select * from public.admin_synthetic_users;
  $tap$,
  '42501',
  null,
  'authenticated users cannot read the admin synthetic view'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails because the view is missing**

Run:

```bash
pnpm exec tsx scripts/run-sql-tests.ts supabase/tests/database/synthetic_users_admin_view.test.sql
```

If the runner only discovers the tests directory, run `pnpm test:sql` and expect FAIL on the new file with `relation "public.admin_synthetic_users" does not exist`.

- [ ] **Step 3: Create the migration**

```bash
pnpm exec supabase migration new synthetic_users_admin_view
```

Write this SQL into the generated file:

```sql
create or replace view public.admin_synthetic_users
with (security_invoker = true) as
select
  synthetic.user_id,
  profile.username,
  profile.display_name,
  profile.social_activity_visible,
  synthetic.persona,
  synthetic.archetype,
  synthetic.daily_budget,
  synthetic.completions_today,
  synthetic.last_active_date,
  synthetic.enabled,
  coalesce(goal_counts.goal_count, 0) as goal_count,
  synthetic.created_at,
  synthetic.updated_at
from public.synthetic_users synthetic
join public.profiles profile
  on profile.id = synthetic.user_id
left join (
  select
    goal.owner_id,
    count(*)::integer as goal_count
  from public.goals goal
  where goal.is_deleted = false
  group by goal.owner_id
) goal_counts
  on goal_counts.owner_id = synthetic.user_id;

comment on view public.admin_synthetic_users is
  'Admin roster of synthetic users. UPDATE mutates main fields; DELETE disables the user.';

create or replace function private.admin_synthetic_users_instead_of_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_username text;
  v_display_name text;
  v_archetype text;
begin
  if new.user_id is distinct from old.user_id then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_user_id_immutable';
  end if;

  v_username := lower(btrim(coalesce(new.username, '')));
  if char_length(v_username) < 3 or char_length(v_username) > 32 or v_username !~ '^[a-z0-9_]+$' then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_username_invalid';
  end if;

  v_display_name := nullif(btrim(coalesce(new.display_name, '')), '');
  v_archetype := nullif(btrim(coalesce(new.archetype, '')), '');
  if v_archetype is null or char_length(v_archetype) > 64 then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_archetype_invalid';
  end if;

  update public.synthetic_users synthetic
  set
    persona = new.persona,
    archetype = v_archetype,
    daily_budget = new.daily_budget,
    enabled = new.enabled,
    updated_at = pg_catalog.now()
  where synthetic.user_id = old.user_id;

  update public.profiles profile
  set
    username = v_username,
    display_name = v_display_name,
    social_activity_visible = new.social_activity_visible
  where profile.id = old.user_id;

  return new;
end;
$$;

create or replace function private.admin_synthetic_users_instead_of_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.synthetic_users synthetic
  set
    enabled = false,
    updated_at = pg_catalog.now()
  where synthetic.user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists admin_synthetic_users_instead_of_update
  on public.admin_synthetic_users;
create trigger admin_synthetic_users_instead_of_update
instead of update on public.admin_synthetic_users
for each row
execute function private.admin_synthetic_users_instead_of_update();

drop trigger if exists admin_synthetic_users_instead_of_delete
  on public.admin_synthetic_users;
create trigger admin_synthetic_users_instead_of_delete
instead of delete on public.admin_synthetic_users
for each row
execute function private.admin_synthetic_users_instead_of_delete();

revoke all on function private.admin_synthetic_users_instead_of_update()
  from public, anon, authenticated;
revoke all on function private.admin_synthetic_users_instead_of_delete()
  from public, anon, authenticated;

revoke all on table public.admin_synthetic_users from public, anon, authenticated;
grant select, update, delete on table public.admin_synthetic_users to service_role;
```

- [ ] **Step 4: Apply the migration and rerun the SQL test**

```bash
pnpm exec supabase db query --local "select 1" >/dev/null
pnpm exec supabase migration up --local
pnpm test:sql
```

If local DB is already dirty, `pnpm supabase:reset` then `pnpm test:sql`. Expected: all SQL tests pass, including 8 assertions in the new file.

- [ ] **Step 5: Document SQL-editor usage in the ops runbook**

Add an "Admin roster" section to `docs/synthetic_social_ops.md` covering:

```sql
select * from public.admin_synthetic_users order by username;

update public.admin_synthetic_users
set enabled = false, persona = 'low'
where username = 'noah_nguyen';

delete from public.admin_synthetic_users
where username = 'noah_nguyen'; -- disables, does not delete auth
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/database/synthetic_users_admin_view.test.sql docs/synthetic_social_ops.md docs/superpowers/plans/2026-08-22-synthetic-users-admin-view.md
git commit -m "$(cat <<'EOF'
feat: add admin SQL view for synthetic users

EOF
)"
```

---

### Task 2: Admin APIs

**Files:**
- Create: `src/app/api/admin/synthetic-users/route.ts`
- Create: `src/app/api/admin/synthetic-users/route.test.ts`
- Create: `src/app/api/admin/synthetic-users/[id]/route.ts`
- Create: `src/app/api/admin/synthetic-users/[id]/route.test.ts`
- Create: `src/app/api/admin/synthetic-config/route.ts`
- Create: `src/app/api/admin/synthetic-config/route.test.ts`
- Modify: `packages/shared/src/supabase/database.types.ts` via `pnpm types:supabase`

**Interfaces:**
- Consumes: `admin_synthetic_users` view, `synthetic_config`, `provision_synthetic_users_service`
- Produces:
  - `GET /api/admin/synthetic-users` → `{ schemaVersion, items, config }`
  - `POST /api/admin/synthetic-users` `{ targetCount, goalsPerUser? }` → `{ schemaVersion, provisionedCount }` (admin role)
  - `PATCH /api/admin/synthetic-users/:id` partial main fields → `{ schemaVersion, item }`
  - `DELETE /api/admin/synthetic-users/:id` → `{ schemaVersion, item }` with `enabled: false`
  - `PATCH /api/admin/synthetic-config` kill-switch and caps → `{ schemaVersion, config }`

DTO:

```ts
{
  userId: string;
  username: string;
  displayName: string | null;
  socialActivityVisible: boolean;
  persona: "low" | "medium" | "high";
  archetype: string;
  dailyBudget: number;
  completionsToday: number;
  lastActiveDate: string | null;
  enabled: boolean;
  goalCount: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 1: Write failing API tests** (404 for non-admins; list returns view rows; patch forwards to the view; delete disables; provision calls RPC; config patch updates singleton)

Follow `src/app/api/admin/challenges/route.test.ts` mock style with `requireAdminContext` and `createAdminClient`.

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm exec vitest run src/app/api/admin/synthetic-users src/app/api/admin/synthetic-config
```

Expected: FAIL because route modules do not exist.

- [ ] **Step 3: Implement the routes** using `requireAdminContext("moderator")` except POST provision which uses `"admin"`. Query/update `admin_synthetic_users` and `synthetic_config` through `createAdminClient()`. Refresh generated types with `pnpm types:supabase`.

- [ ] **Step 4: Re-run API tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/synthetic-users src/app/api/admin/synthetic-config packages/shared/src/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
feat: add admin APIs for synthetic user roster

EOF
)"
```

---

### Task 3: Admin dashboard UI

**Files:**
- Create: `src/features/admin/synthetic-users-manager.tsx`
- Create: `src/app/(admin)/admin/synthetic-users/page.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`
- Modify: `docs/synthetic_social_ops.md` (link the `/admin/synthetic-users` page)

**Interfaces:**
- Consumes: the APIs from Task 2
- Produces: searchable/filterable roster with inline edits for `enabled`, `persona`, `dailyBudget`, `archetype`, `displayName`, `username`, `socialActivityVisible`; config card for the kill switch; scale form posting `targetCount`

- [ ] **Step 1: Add the manager and page following `AdminChallengesManager` fetch/save patterns, but keep the surface smaller (filters + row edits, no giant create form).**

Filters (client-side on the loaded list): search (`username` / `displayName` / `archetype`), persona, enabled.

- [ ] **Step 2: Link it from the admin dashboard.**

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/synthetic-users-manager.tsx src/app/\(admin\)/admin/synthetic-users src/app/\(admin\)/admin/page.tsx docs/synthetic_social_ops.md
git commit -m "$(cat <<'EOF'
feat: add synthetic users admin roster UI

EOF
)"
```

---

### Task 4: Open stacked PR

- [ ] Push `stack/synthetic-social-pr4-admin-view` and open a PR targeting `stack/synthetic-social-pr3-ops-backfill`.
